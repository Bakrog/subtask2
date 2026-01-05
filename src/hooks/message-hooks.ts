import {
  getPluginConfig,
  getAllPendingReturns,
  deletePendingReturn,
  setHasActiveSubtask,
  getHasActiveSubtask,
  hasProcessedS2Message,
  addProcessedS2Message,
  OPENCODE_GENERIC,
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
} from "../loop";

/**
 * Hook: experimental.chat.messages.transform
 * Handles /s2{...} inline subtasks and return prompt injection
 */
export async function chatMessagesTransform(input: any, output: any) {
  // Check for /s2{...} or /s2 inline subtask in user messages
  for (const msg of output.messages) {
    if (msg.info?.role !== "user") continue;

    // Track processed messages by ID to avoid infinite loop
    const msgId = (msg.info as any)?.id;
    if (msgId && hasProcessedS2Message(msgId)) continue;

    for (const part of msg.parts) {
      if (part.type !== "text") continue;
      const text = part.text.trim();

      // Match /s2{...} or /s2 (space)
      const textLower = text.toLowerCase();
      if (textLower.startsWith("/s2{") || textLower.startsWith("/s2 ")) {
        log(`/s2 detected in message: "${text.substring(0, 60)}..."`);

        // Mark as processed BEFORE spawning
        if (msgId) addProcessedS2Message(msgId);

        // Parse: remove "/s2" prefix, parseInlineSubtask handles both {overrides} and plain prompt
        const toParse = text.startsWith("/s2{")
          ? text.substring(3)
          : `{} ${text.substring(4)}`;
        const parsed = parseInlineSubtask(toParse);

        if (parsed) {
          log(
            `/s2 inline subtask: prompt="${parsed.prompt.substring(
              0,
              50
            )}...", overrides=${JSON.stringify(parsed.overrides)}`
          );
          // Replace with instruction to say minimal response
          part.text = S2_INLINE_INSTRUCTION;
          // Spawn the subtask - get sessionID from message info
          const sessionID =
            (msg.info as any)?.sessionID || (input as any).sessionID;
          log(`/s2 sessionID: ${sessionID}`);
          if (sessionID) {
            executeInlineSubtask(parsed, sessionID).catch(console.error);
          } else {
            log(`/s2 ERROR: no sessionID found`);
          }
          return;
        } else {
          log(`/s2 parse failed for: "${toParse}"`);
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
      const evalPrompt = createEvaluationPrompt(
        retryState.config.until,
        retryState.iteration,
        retryState.config.max
      );
      lastGenericPart.text = evalPrompt;
      log(
        `retry: injected evaluation prompt for "${retryState.config.until}"`
      );
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
