import {
  getClient,
  getReturnState,
  deleteReturnState,
  getPendingNonSubtaskReturns,
  deletePendingNonSubtaskReturns,
  hasLastReturnWasCommand,
  deleteExecutedReturn,
} from "../core/state";
import { log } from "../utils/logger";
import { executeReturn } from "../features/returns";
import {
  getPendingEvaluation,
  clearPendingEvaluation,
  parseLoopDecision,
  incrementLoopIteration,
  getLoopState,
  clearLoop,
} from "../loop";

/**
 * Hook: experimental.text.complete
 * Handles return chain execution and loop continuation
 */
export async function textComplete(input: any) {
  const client = getClient();
  log(`text.complete: sessionID=${input.sessionID}, hasReturnState=${getReturnState(input.sessionID) !== undefined}`);
  
  // Check for loop evaluation response (orchestrator-decides pattern)
  const evalState = getPendingEvaluation(input.sessionID);
  if (evalState) {
    let decision: "break" | "continue" = "continue";
    
    // Only parse decision if this is a conditional loop (has until condition)
    if (evalState.config.until) {
      // Get the last assistant message to check for loop decision
      const messages = await client.session.messages({
        path: { id: input.sessionID },
      });
      const lastMsg = messages.data?.[messages.data.length - 1];
      const lastText =
        lastMsg?.parts?.find((p: any) => p.type === "text")?.text || "";

      decision = parseLoopDecision(lastText);
      log(`loop: evaluation response decision=${decision}`);
    } else {
      // Unconditional loop: always continue (until max reached)
      log(`loop: unconditional loop, auto-continuing`);
    }

    clearPendingEvaluation(input.sessionID);

    if (decision === "continue") {
      // Increment and re-run
      incrementLoopIteration(input.sessionID);
      const state = getLoopState(input.sessionID);
      if (state) {
        log(
          `retry: continuing iteration ${state.iteration}/${state.config.max}`
        );
        
        if (state.commandName === "_inline_subtask_") {
          // Re-execute inline subtask directly via promptAsync
          log(`retry: re-executing inline subtask with prompt "${state.arguments?.substring(0, 50)}..."`);
          
          // Build model from override if present
          let model: { providerID: string; modelID: string } | undefined;
          if (state.model?.includes("/")) {
            const [providerID, ...rest] = state.model.split("/");
            model = { providerID, modelID: rest.join("/") };
          }
          
          try {
            await client.session.promptAsync({
              path: { id: input.sessionID },
              body: {
                parts: [
                  {
                    type: "subtask",
                    agent: state.agent || "build",
                    model,
                    description: "Inline subtask (retry)",
                    prompt: state.arguments || "",
                  },
                ],
              },
            });
          } catch (e) {
            log(`retry: inline subtask failed:`, e);
          }
        } else {
          // Re-execute the command
          const cmdWithArgs = `/${state.commandName}${
            state.arguments ? " " + state.arguments : ""
          }`;
          deleteExecutedReturn(`${input.sessionID}:${cmdWithArgs}`);
          executeReturn(cmdWithArgs, input.sessionID).catch(console.error);
        }
        return;
      }
    } else {
      // Break - clear the loop and continue with normal flow
      log(`retry: breaking loop, condition satisfied`);
      clearLoop(input.sessionID);
    }
  }

  // Handle non-subtask command returns
  const pendingReturn = getPendingNonSubtaskReturns(input.sessionID);
  if (pendingReturn?.length && client) {
    const next = pendingReturn.shift()!;
    if (!pendingReturn.length)
      deletePendingNonSubtaskReturns(input.sessionID);
    executeReturn(next, input.sessionID).catch(console.error);
    return;
  }

  // Handle remaining returns
  const remaining = getReturnState(input.sessionID);
  if (!remaining?.length || !client) return;

  // If a command/inline subtask is running, don't advance - tool.after will handle it
  if (hasLastReturnWasCommand(input.sessionID)) {
    log(`text.complete: waiting for command/inline subtask to complete`);
    return;
  }

  const next = remaining.shift()!;
  if (!remaining.length) deleteReturnState(input.sessionID);
  executeReturn(next, input.sessionID).catch(console.error);
}
