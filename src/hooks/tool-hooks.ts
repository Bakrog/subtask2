import {
  getConfigs,
  setSessionMainCommand,
  getSessionMainCommand,
  setCallState,
  deleteCallState,
  getCallState,
  setReturnState,
  setPipedArgsQueue,
  setFirstReturnPrompt,
  deletePendingNonSubtaskReturns,
  setPendingReturn,
  hasPendingReturn,
  consumePendingParentForPrompt,
  setSubtaskParentSession,
  deleteSubtaskParentSession,
  getSubtaskParentSession,
  deleteLastReturnWasCommand,
  setHasActiveSubtask,
} from "../core/state";
import { getConfig } from "../commands/resolver";
import { log } from "../utils/logger";
import { hasTurnReferences } from "../parsing";
import { resolveTurnReferences } from "../features/turns";
import {
  getLoopState,
  setPendingEvaluation,
  clearLoop,
  clearPendingEvaluation,
  isMaxIterationsReached,
} from "../loop";

/**
 * Hook: tool.execute.before
 * Handles task tool initialization and $TURN resolution
 */
export async function toolExecuteBefore(input: any, output: any) {
  if (input.tool !== "task") return;

  // Mark that we have an active subtask (for generic return replacement)
  setHasActiveSubtask(true);

  const cmd = output.args?.command;
  const prompt = output.args?.prompt;
  const description = output.args?.description;
  const configs = getConfigs();
  let mainCmd = getSessionMainCommand(input.sessionID);

  // Look up parent session by prompt content (race-safe approach)
  const pendingParentSession = prompt
    ? consumePendingParentForPrompt(prompt)
    : null;

  // Track parent session for inline subtasks (so tool.execute.after can find the loop state)
  if (pendingParentSession && pendingParentSession !== input.sessionID) {
    setSubtaskParentSession(input.sessionID, pendingParentSession);
    log(
      `tool.before: mapped subtask ${input.sessionID} -> parent ${pendingParentSession}`
    );
  }

  log(
    `tool.before: callID=${
      input.callID
    }, cmd=${cmd}, desc="${description?.substring(0, 30)}", mainCmd=${mainCmd}`
  );

  // If mainCmd is not set (command.execute.before didn't fire - no PR),
  // set the first subtask command as the main command
  if (!mainCmd && cmd && getConfig(configs, cmd)) {
    setSessionMainCommand(input.sessionID, cmd);
    mainCmd = cmd;
    const cmdConfig = getConfig(configs, cmd)!;

    // Parse piped args from prompt if present (fallback for non-PR)
    if (prompt && prompt.includes("||")) {
      const pipeMatch = prompt.match(/\|\|(.+)/);
      if (pipeMatch) {
        const pipedPart = pipeMatch[1];
        const pipedArgs = pipedPart
          .split("||")
          .map((s: string) => s.trim())
          .filter(Boolean);
        if (pipedArgs.length) {
          setPipedArgsQueue(input.sessionID, pipedArgs);
          output.args.prompt = prompt.replace(/\s*\|\|.+$/, "").trim();
        }
      }
    }

    // Also set up return state since command.execute.before didn't run
    // Only do this once per session
    if (cmdConfig.return.length > 0) {
      // Store the first return prompt (replaces "Summarize..." in $TURN)
      setFirstReturnPrompt(input.sessionID, cmdConfig.return[0]);
      if (cmdConfig.return.length > 1) {
        setReturnState(input.sessionID, [...cmdConfig.return.slice(1)]);
        log(`Set returnState: ${cmdConfig.return.slice(1).length} items`);
      }
    }
  }

  // Resolve $TURN[n] in the prompt for ANY subtask
  // Use parent session if this command was triggered via executeReturn
  if (prompt && hasTurnReferences(prompt)) {
    const resolveFromSession = pendingParentSession || input.sessionID;
    log(
      `tool.execute.before: resolving $TURN in prompt (from ${
        pendingParentSession ? "parent" : "current"
      } session ${resolveFromSession})`
    );
    output.args.prompt = await resolveTurnReferences(
      prompt,
      resolveFromSession
    );
    log(
      `tool.execute.before: resolved prompt (${output.args.prompt.length} chars)`
    );
    // Note: consumePendingParentForPrompt already removed the entry
  }

  if (cmd && getConfig(configs, cmd)) {
    const cmdConfig = getConfig(configs, cmd)!;
    if (cmd === mainCmd) {
      deletePendingNonSubtaskReturns(input.sessionID);
    }

    setCallState(input.callID, cmd);

    if (cmd === mainCmd && cmdConfig.return.length > 1) {
      setReturnState(input.sessionID, [...cmdConfig.return.slice(1)]);
    }
  }
}

/**
 * Hook: tool.execute.after
 * Handles task completion, loop evaluation setup, and return triggers
 */
export async function toolExecuteAfter(input: any, output: any) {
  if (input.tool !== "task") return;
  const cmd = getCallState(input.callID);

  log(`tool.after: callID=${input.callID}, cmd=${cmd}, wasTracked=${!!cmd}`);

  // Check for active retry loop - inline subtasks have cmd=undefined
  // For inline subtasks, the loop state is on the PARENT session, not the subtask session
  const parentSession = getSubtaskParentSession(input.sessionID);
  const loopSession = parentSession || input.sessionID;
  const retryLoop = getLoopState(loopSession);
  const isInlineLoopIteration = retryLoop?.commandName === "_inline_subtask_";

  log(
    `tool.after: parentSession=${parentSession}, loopSession=${loopSession}, hasLoop=${!!retryLoop}, isInlineLoop=${isInlineLoopIteration}`
  );

  // Check if this is a frontmatter loop iteration (cmd may be undefined for subtask:true commands)
  const isFrontmatterLoop =
    retryLoop && retryLoop.commandName !== "_inline_subtask_";

  if (!cmd && !isInlineLoopIteration && !isFrontmatterLoop) {
    // Already processed or not our command (and not a loop iteration)
    return;
  }
  if (cmd) {
    deleteCallState(input.callID);
  }
  // Clean up parent session mapping
  if (parentSession) {
    deleteSubtaskParentSession(input.sessionID);
  }

  const mainCmd =
    getSessionMainCommand(loopSession) ||
    getSessionMainCommand(input.sessionID);
  const configs = getConfigs();
  const cmdConfig = cmd ? getConfig(configs, cmd) : undefined;

  log(
    `tool.after: cmd=${cmd}, mainCmd=${mainCmd}, isMain=${
      cmd === mainCmd
    }, hasReturn=${!!cmdConfig?.return?.length}, isInlineLoop=${isInlineLoopIteration}`
  );

  // For inline subtasks, cmd is undefined but commandName is "_inline_subtask_"
  // For frontmatter loops on subtask:true commands, cmd may be undefined but mainCmd matches
  const isLoopIteration =
    retryLoop &&
    (cmd === retryLoop.commandName ||
      mainCmd === retryLoop.commandName ||
      isInlineLoopIteration);

  // Clear command flag when inline subtask completes
  if (retryLoop?.commandName === "_inline_subtask_") {
    deleteLastReturnWasCommand(loopSession);
  }

  if (isLoopIteration) {
    log(
      `retry: completed iteration ${retryLoop.iteration}/${retryLoop.config.max}`
    );

    // Check if max iterations reached
    if (isMaxIterationsReached(loopSession)) {
      log(`retry: MAX ITERATIONS reached (${retryLoop.config.max}), stopping`);
      clearLoop(loopSession);
      clearPendingEvaluation(loopSession);
      // Continue with normal return flow
    } else {
      // Store state for evaluation - main LLM will decide if we continue
      setPendingEvaluation(loopSession, { ...retryLoop });
      log(
        `retry: pending evaluation for condition "${retryLoop.config.until}"`
      );
      // The evaluation prompt will be injected via pendingReturns
    }
  }

  // For inline loops, set pendingReturn on the parent session for evaluation
  const returnSession = isInlineLoopIteration ? loopSession : input.sessionID;

  if (cmd && cmd === mainCmd && cmdConfig?.return?.length) {
    // Only set pendingReturn if we haven't already (dedup check)
    if (!hasPendingReturn(returnSession)) {
      log(`Setting pendingReturn: ${cmdConfig.return[0].substring(0, 50)}...`);
      setPendingReturn(returnSession, cmdConfig.return[0]);
    } else {
      log(`Skipping duplicate main command - pendingReturn already set`);
      // Clear any loop state that may have been set by the duplicate
      if (retryLoop) {
        clearLoop(loopSession);
        clearPendingEvaluation(loopSession);
      }
    }
  } else if (cmd && cmd !== mainCmd) {
    log(`task.after: ${cmd} (parallel of ${mainCmd})`);
  }
}
