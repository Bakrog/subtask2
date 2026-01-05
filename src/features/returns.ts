import type { LoopConfig } from "../types";
import {
  getClient,
  getConfigs,
  hasExecutedReturn,
  addExecutedReturn,
  setPendingParentSession,
  setSessionMainCommand,
  setPendingModelOverride,
  getReturnArgsState,
  deleteReturnArgsState,
  setLastReturnWasCommand,
} from "../core/state";
import { getConfig } from "../commands/resolver";
import { log } from "../utils/logger";
import { parseCommandWithOverrides, hasTurnReferences } from "../parsing";
import { resolveTurnReferences } from "./turns";
import { startLoop } from "../loop";

/**
 * Feature: Return execution
 * Executes return items (commands or prompts) after subtask completion
 */

export async function executeReturn(
  item: string,
  sessionID: string,
  loopOverride?: LoopConfig
) {
  // Dedup check to prevent double execution
  const key = `${sessionID}:${item}`;
  if (hasExecutedReturn(key)) return;
  addExecutedReturn(key);

  const client = getClient();

  if (item.startsWith("/")) {
    // Parse command with potential overrides: /cmd{model:provider/id,loop:5,until:DONE} args
    // Also handles inline subtask syntax: /s2{loop:5,until:condition} prompt text
    const parsed = parseCommandWithOverrides(item);

    if (parsed.isInlineSubtask) {
      // Inline subtask: /s2{overrides} prompt - execute as subtask without command file
      let prompt = parsed.arguments || "";

      // Resolve $TURN references in the prompt
      if (hasTurnReferences(prompt)) {
        prompt = await resolveTurnReferences(prompt, sessionID);
      }

      // Build model from override if present
      let model: { providerID: string; modelID: string } | undefined;
      if (parsed.overrides.model?.includes("/")) {
        const [providerID, ...rest] = parsed.overrides.model.split("/");
        model = { providerID, modelID: rest.join("/") };
      }

      // Start loop if configured
      const loopConfig = parsed.overrides.loop || loopOverride;
      if (loopConfig) {
        startLoop(sessionID, loopConfig, "_inline_subtask_", prompt);
        log(
          `executeReturn: started inline subtask loop for ${sessionID}: max=${loopConfig.max}, until="${loopConfig.until}"`
        );
      }

      log(
        `executeReturn: inline subtask with prompt "${prompt.substring(
          0,
          50
        )}..." (agent=${parsed.overrides.agent || "build"})`
      );
      setPendingParentSession(sessionID);

      try {
        log(`executeReturn: calling promptAsync for inline subtask...`);
        // Use promptAsync with subtask part to run as subtask
        const result = await client.session.promptAsync({
          path: { id: sessionID },
          body: {
            parts: [
              {
                type: "subtask",
                agent: parsed.overrides.agent || "build",
                model,
                description: "Inline subtask",
                prompt,
              },
            ],
          },
        });
        log(`executeReturn: promptAsync returned: ${JSON.stringify(result)}`);
      } catch (e) {
        log(`executeReturn inline subtask FAILED:`, e);
      }
      // Mark as command so text.complete doesn't advance prematurely
      setLastReturnWasCommand(sessionID, true);
      return;
    }

    // Regular command execution
    let args = parsed.arguments || "";

    // Find the path key for this command (OpenCode needs full path for subfolder commands)
    const configs = getConfigs();
    const allKeys = Object.keys(configs);
    const pathKey =
      allKeys.find(
        k => k.includes("/") && k.endsWith("/" + parsed.command)
      ) || parsed.command;

    // Store model override if present (will be consumed by command.execute.before)
    if (parsed.overrides.model) {
      setPendingModelOverride(sessionID, parsed.overrides.model);
      log(
        `executeReturn: stored model override for ${sessionID}: ${parsed.overrides.model}`
      );
    }

    // Store loop config if present (inline takes precedence over passed-in)
    const loopConfig = parsed.overrides.loop || loopOverride;
    if (loopConfig) {
      startLoop(sessionID, loopConfig, pathKey, args);
      log(
        `executeReturn: started retry loop for ${sessionID}: max=${loopConfig.max}, until="${loopConfig.until}"`
      );
    }

    // Check if we have piped args for this return command
    const returnArgs = getReturnArgsState(sessionID);
    if (returnArgs?.length) {
      const pipeArg = returnArgs.shift();
      if (!returnArgs.length) deleteReturnArgsState(sessionID);
      if (pipeArg) args = pipeArg;
    }

    log(
      `executeReturn: /${parsed.command} -> ${pathKey} args="${args}" (parent=${sessionID})`
    );
    setSessionMainCommand(sessionID, pathKey);
    // Set parent session for $TURN resolution - will be consumed by tool.execute.before
    setPendingParentSession(sessionID);

    try {
      await client.session.command({
        path: { id: sessionID },
        body: { command: pathKey, arguments: args || "" },
      });
    } catch (e) {
      log(`executeReturn FAILED: ${pathKey}`, e);
    }
  } else {
    log(`executeReturn: prompt "${item.substring(0, 40)}..."`);
    await client.session.promptAsync({
      path: { id: sessionID },
      body: { parts: [{ type: "text", text: item }] },
    });
  }
}
