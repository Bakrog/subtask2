import { describe, it, expect } from "bun:test";
import { flattenParallels } from "../../src/features/parallel";

describe("flattenParallels inline subtask", () => {
  it("creates subtask part for inline parallel", async () => {
    const parts = await flattenParallels(
      [
        {
          command: "_inline_subtask_",
          inline: true,
          prompt: "do the thing",
          model: "openai/gpt-4o",
          agent: "explore",
          as: "result",
        },
      ],
      "",
      "session-inline"
    );

    expect(parts).toHaveLength(1);
    expect(parts[0]).toEqual({
      type: "subtask",
      agent: "explore",
      model: { providerID: "openai", modelID: "gpt-4o" },
      description: "Inline parallel subtask",
      command: "_inline_subtask_",
      prompt: "do the thing",
      as: "result",
    });
  });
});
