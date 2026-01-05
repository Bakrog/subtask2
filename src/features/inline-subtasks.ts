import { getClient, registerPendingParentForPrompt } from "../core/state";
import { log } from "../utils/logger";
import { hasTurnReferences } from "../parsing";
import { resolveTurnReferences } from "./turns";
import type { CommandOverrides } from "../parsing";
import { startLoop } from "../loop";

/**
 * Feature: Inline subtask execution
 * Executes /s2{...} and /{...} inline subtasks without command files
 */

export async function executeInlineSubtask(
  parsed: {
    prompt: string;
    overrides: CommandOverrides;
  },
  sessionID: string
) {
  let prompt = parsed.prompt;

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

  log(
    `executeInlineSubtask: prompt="${prompt.substring(0, 50)}...", model=${
      parsed.overrides.model
    }, agent=${parsed.overrides.agent}`
  );

  // Start loop if configured
  if (parsed.overrides.loop) {
    startLoop(
      sessionID,
      parsed.overrides.loop,
      "_inline_subtask_",
      prompt,
      parsed.overrides.model,
      parsed.overrides.agent
    );
    log(
      `inline subtask: started loop for "${parsed.overrides.loop.until}" max=${parsed.overrides.loop.max}`
    );
  }

  const client = getClient();

  // Register parent session for $TURN resolution (race-safe: keyed by prompt)
  registerPendingParentForPrompt(prompt, sessionID);

  // Execute as subtask via promptAsync
  try {
    log(`executeInlineSubtask: calling promptAsync for session ${sessionID}`);
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
    log(
      `executeInlineSubtask: promptAsync returned: ${JSON.stringify(result)}`
    );
  } catch (err) {
    log(`executeInlineSubtask ERROR: ${err}`);
  }
}
