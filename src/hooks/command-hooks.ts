import type { LoopConfig } from "../types";
import {
  getConfigs,
  setSessionMainCommand,
  setPipedArgsQueue,
  setPendingNonSubtaskReturns,
  getPendingModelOverride,
  deletePendingModelOverride,
  registerPendingParentForPrompt,
} from "../core/state";
import { getConfig } from "../commands/resolver";
import { log } from "../utils/logger";
import { hasTurnReferences } from "../parsing";
import { resolveTurnReferences } from "../features/turns";
import { flattenParallels } from "../features/parallel";
import { executeAutoWorkflow } from "../features/auto";
import { startLoop, getLoopState } from "../loop";

/**
 * Hook: command.execute.before
 * Handles command initialization, argument parsing, parallel execution, and loop setup
 */
export async function commandExecuteBefore(
  input: { command: string; sessionID: string; arguments: string },
  output: { parts: any[] }
) {
  const cmd = input.command;
  const configs = getConfigs();
  const config = getConfig(configs, cmd);
  setSessionMainCommand(input.sessionID, cmd);
  log(
    `cmd.before: ${cmd}`,
    config
      ? {
          return: config.return,
          parallel: config.parallel.map(p => p.command),
          agent: config.agent,
        }
      : "no config"
  );

  // CHECK FOR AUTO MODE FIRST - intercepts command and generates workflow dynamically
  if (config?.auto) {
    log(`command.execute.before: detected subtask2:auto for ${cmd}`);

    // Build model if specified in frontmatter
    let model: { providerID: string; modelID: string } | undefined;
    if (config.model?.includes("/")) {
      const [providerID, ...rest] = config.model.split("/");
      model = { providerID, modelID: rest.join("/") };
    }

    // Execute auto workflow - ignores return/parallel/$TURN from frontmatter
    await executeAutoWorkflow(
      input.arguments || "",
      input.sessionID,
      config.agent,
      model
    );

    // Prevent normal command execution
    return { ...output, abort: true };
  }

  // Check for model override: from pendingModelOverride (set by executeReturn)
  // or from inline syntax in arguments: {model:provider/id} at start
  let effectiveArgs = input.arguments;
  let modelOverride = getPendingModelOverride(input.sessionID);
  let retryOverride: LoopConfig | undefined;

  // Parse inline override from arguments if present (for direct /cmd{model:...,retry:...} invocation)
  const inlineMatch = effectiveArgs.match(/^\{([^}]+)\}\s*/);
  if (inlineMatch) {
    effectiveArgs = effectiveArgs.slice(inlineMatch[0].length);
    const modelMatch = inlineMatch[1].match(/model:([^,}]+)/);
    if (modelMatch) modelOverride = modelMatch[1].trim();

    // Parse retry inline
    const retryMatch = inlineMatch[1].match(/retry:(\d+)/);
    const untilMatch = inlineMatch[1].match(/until:([^,}]+)/);
    if (retryMatch && untilMatch) {
      retryOverride = {
        max: parseInt(retryMatch[1], 10),
        until: untilMatch[1].trim(),
      };
    }
  }

  // Check for retry config: inline > frontmatter
  const fmRetry = config?.loop;
  const activeRetry = retryOverride || fmRetry;
  if (activeRetry && !getLoopState(input.sessionID)) {
    startLoop(input.sessionID, activeRetry, cmd, effectiveArgs);
    log(
      `cmd.before: started retry loop: max=${activeRetry.max}, until="${activeRetry.until}"`
    );
  }

  // Note: Parent session registration for subtasks happens at the end of this function
  // after all prompt modifications, using registerPendingParentForPrompt()

  // Apply model override to subtask parts
  if (modelOverride) {
    deletePendingModelOverride(input.sessionID);
    if (modelOverride.includes("/")) {
      const [providerID, ...rest] = modelOverride.split("/");
      for (const part of output.parts) {
        if (part.type === "subtask") {
          part.model = { providerID, modelID: rest.join("/") };
        }
      }
      log(`cmd.before: applied model override: ${modelOverride}`);
    }
  }

  // Parse pipe-separated arguments: main || arg1 || arg2 || arg3 ...
  const argSegments = effectiveArgs.split("||").map(s => s.trim());
  let mainArgs = argSegments[0] || "";
  const allPipedArgs = argSegments.slice(1);

  // Store piped args for consumption by parallels and return commands
  if (allPipedArgs.length) {
    setPipedArgsQueue(input.sessionID, allPipedArgs);
  }

  // Resolve $TURN[n] references in mainArgs
  if (hasTurnReferences(mainArgs)) {
    mainArgs = await resolveTurnReferences(mainArgs, input.sessionID);
    log(`Resolved $TURN in mainArgs: ${mainArgs.length} chars`);
  }

  // Resolve $TURN[n] references in output parts
  log(`Processing ${output.parts.length} parts for $TURN refs`);
  for (const part of output.parts) {
    log(
      `Part type=${
        part.type
      }, hasPrompt=${!!part.prompt}, hasText=${!!part.text}`
    );
    if (part.type === "subtask" && part.prompt) {
      log(`Subtask prompt (first 200): ${part.prompt.substring(0, 200)}`);
      if (hasTurnReferences(part.prompt)) {
        log(`Found $TURN in subtask prompt, resolving...`);
        part.prompt = await resolveTurnReferences(part.prompt, input.sessionID);
        log(
          `Resolved subtask prompt (first 200): ${part.prompt.substring(
            0,
            200
          )}`
        );
      }
    }
    if (part.type === "text" && part.text) {
      log(`Text part (first 200): ${part.text.substring(0, 200)}`);
      if (hasTurnReferences(part.text)) {
        log(`Found $TURN in text part, resolving...`);
        part.text = await resolveTurnReferences(part.text, input.sessionID);
        log(`Resolved text part (first 200): ${part.text.substring(0, 200)}`);
      }
    }
  }

  // Fix main command's parts to use only mainArgs (not the full pipe string)
  if (argSegments.length > 1) {
    for (const part of output.parts) {
      if (part.type === "subtask" && part.prompt) {
        part.prompt = part.prompt.replaceAll(input.arguments, mainArgs);
      }
      if (part.type === "text" && part.text) {
        part.text = part.text.replaceAll(input.arguments, mainArgs);
      }
    }
  }

  // Track non-subtask commands with return for later injection
  const hasSubtaskPart = output.parts.some((p: any) => p.type === "subtask");
  if (!hasSubtaskPart && config?.return?.length) {
    setPendingNonSubtaskReturns(input.sessionID, [...config.return]);
  }

  // Register parent session for each subtask prompt (race-safe: keyed by prompt content)
  for (const part of output.parts) {
    if (part.type === "subtask" && part.prompt) {
      registerPendingParentForPrompt(part.prompt, input.sessionID);
      log(
        `cmd.before: registered parent for prompt (${part.prompt.length} chars)`
      );
    }
  }

  if (!config?.parallel?.length) return;

  // Recursively flatten all nested parallels
  const parallelParts = await flattenParallels(
    config.parallel,
    mainArgs,
    input.sessionID
  );
  output.parts.push(...parallelParts);
}
