import {
  getPluginConfig,
  getAllPendingReturns,
  deletePendingReturn,
  setHasActiveSubtask,
  getHasActiveSubtask,
  hasProcessedS2Message,
  addProcessedS2Message,
  OPENCODE_GENERIC,
  getConfigs,
} from "../core/state";
import { log } from "../utils/logger";
import { DEFAULT_PROMPT } from "../utils/config";
import { S2_INLINE_INSTRUCTION } from "../utils/prompts";
import { parseInlineSubtask } from "../parsing";
import { executeInlineSubtask } from "../features/inline-subtasks";
import { executeReturn } from "../features/returns";
import {
  getAllPendingEvaluations,
  createEvaluationPrompt,
  createYieldPrompt,
} from "../loop";

/**
 * Hook: experimental.chat.messages.transform
 * Handles /subtask {...} inline subtasks and return prompt injection
 */
export async function chatMessagesTransform(input: any, output: any) {
  // Check for /subtask in user messages
  // With the placeholder command file, OpenCode routes /subtask to command hook
  // This is a fallback for when no placeholder exists
  for (const msg of output.messages) {
    if (msg.info?.role !== "user") continue;

    // Track processed messages by ID to avoid infinite loop
    const msgId = (msg.info as any)?.id;
    if (msgId && hasProcessedS2Message(msgId)) continue;

    for (const part of msg.parts) {
      if (part.type !== "text") continue;
      const text = part.text.trim();
      const textLower = text.toLowerCase();

      // Match /subtask (with space) - the recommended syntax
      if (textLower.startsWith("/subtask ")) {
        // If /subtask command exists, defer to command hook for instant execution
        const configs = getConfigs();
        if (configs["subtask"]) {
          log(
            `/subtask detected but deferring to command hook (subtask command exists)`
          );
          continue;
        }

        // Fallback: handle via message transform when no placeholder command exists
        log(
          `/subtask detected in message (no placeholder): "${text.substring(0, 60)}..."`
        );

        // Mark as processed BEFORE spawning
        if (msgId) addProcessedS2Message(msgId);

        // Parse: remove "/subtask " prefix
        const toParse = text.substring("/subtask ".length);
        // Wrap in {} if it doesn't start with { (plain prompt case)
        const parseInput = toParse.startsWith("{") ? toParse : `{} ${toParse}`;
        const parsed = parseInlineSubtask(parseInput);

        if (parsed) {
          log(
            `/subtask inline subtask: prompt="${parsed.prompt.substring(
              0,
              50
            )}...", overrides=${JSON.stringify(parsed.overrides)}`
          );
          // Replace with instruction to say minimal response
          part.text = S2_INLINE_INSTRUCTION;
          // Spawn the subtask - get sessionID from message info
          const sessionID =
            (msg.info as any)?.sessionID || (input as any).sessionID;
          log(`/subtask sessionID: ${sessionID}`);
          if (sessionID) {
            executeInlineSubtask(parsed, sessionID).catch(console.error);
          } else {
            log(`/subtask ERROR: no sessionID found`);
          }
          return;
        } else {
          log(`/subtask parse failed for: "${parseInput}"`);
        }
      }
    }
  }

  // Find the LAST message with OPENCODE_GENERIC
  let lastGenericPart: any = null;

  for (const msg of output.messages) {
    for (const part of msg.parts) {
      if (part.type === "text" && part.text === OPENCODE_GENERIC) {
        lastGenericPart = part;
      }
    }
  }

  if (lastGenericPart) {
    // Check for pending loop evaluation first (orchestrator-decides pattern)
    for (const [sessionID, retryState] of getAllPendingEvaluations()) {
      // Check if this is an unconditional loop (no until condition)
      if (!retryState.config.until) {
        // Unconditional loop: inject yield prompt, no evaluation needed
        const yieldPrompt = createYieldPrompt(
          retryState.iteration,
          retryState.config.max
        );
        lastGenericPart.text = yieldPrompt;
        log(
          `loop: injected yield prompt (unconditional loop ${retryState.iteration}/${retryState.config.max})`
        );
      } else {
        // Conditional loop: inject evaluation prompt
        const evalPrompt = createEvaluationPrompt(
          retryState.config.until,
          retryState.iteration,
          retryState.config.max
        );
        lastGenericPart.text = evalPrompt;
        log(
          `loop: injected evaluation prompt for "${retryState.config.until}"`
        );
      }
      // Don't delete yet - we need it when parsing the response
      return;
    }

    // Check for pending return
    for (const [sessionID, returnPrompt] of getAllPendingReturns()) {
      deletePendingReturn(sessionID);
      setHasActiveSubtask(false);
      if (returnPrompt.startsWith("/")) {
        // Command return: clear text and execute command
        lastGenericPart.text = "";
        executeReturn(returnPrompt, sessionID).catch(console.error);
      } else {
        // Plain prompt return: replace generic message with the prompt text
        // This becomes the assistant's message - no LLM call needed
        lastGenericPart.text = returnPrompt;
      }
      return;
    }

    // No pending return found, use generic replacement if configured
    const pluginConfig = getPluginConfig();
    if (getHasActiveSubtask() && pluginConfig.replace_generic) {
      log(`Using default generic replacement`);
      lastGenericPart.text = pluginConfig.generic_return ?? DEFAULT_PROMPT;
      setHasActiveSubtask(false);
      return;
    }
  }
}
