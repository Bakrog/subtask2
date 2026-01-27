import { describe, it, expect, beforeEach } from "bun:test";
import { commandExecuteBefore } from "../../src/hooks/command-hooks";
import {
  setConfigs,
  setPendingModelOverride,
  setPendingAgentOverride,
  getPendingModelOverride,
  getPendingAgentOverride,
} from "../../src/core/state";
import { clearLoop, getLoopState } from "../../src/loop";

describe("commandExecuteBefore overrides", () => {
  const sessionID = "session-overrides";

  beforeEach(() => {
    setConfigs({
      plan: {
        return: [],
        parallel: [],
      },
    });
    clearLoop(sessionID);
  });

  it("applies inline model/agent/loop overrides", async () => {
    const input = {
      command: "plan",
      sessionID,
      arguments:
        "{model:openai/gpt-4o && agent:explore && loop:3 && until:done} do it",
    };
    const output = {
      parts: [
        {
          type: "subtask",
          agent: "build",
          prompt: `Work on ${input.arguments}`,
        },
      ],
    };

    await commandExecuteBefore(input, output);

    expect(output.parts[0].agent).toBe("explore");
    expect((output.parts[0] as any).model).toEqual({
      providerID: "openai",
      modelID: "gpt-4o",
    });
    expect(output.parts[0].prompt).toBe("Work on do it");

    const loopState = getLoopState(sessionID);
    expect(loopState?.config).toEqual({ max: 3, until: "done" });
    expect(loopState?.model).toBe("openai/gpt-4o");
    expect(loopState?.agent).toBe("explore");
  });

  it("uses pending overrides from returns when no inline block", async () => {
    setPendingModelOverride(sessionID, "openai/gpt-4o");
    setPendingAgentOverride(sessionID, "plan");

    const input = {
      command: "plan",
      sessionID,
      arguments: "ship it",
    };
    const output = {
      parts: [
        {
          type: "subtask",
          agent: "build",
          prompt: `Work on ${input.arguments}`,
        },
      ],
    };

    await commandExecuteBefore(input, output);

    expect(output.parts[0].agent).toBe("plan");
    expect((output.parts[0] as any).model).toEqual({
      providerID: "openai",
      modelID: "gpt-4o",
    });
    expect(getPendingModelOverride(sessionID)).toBeUndefined();
    expect(getPendingAgentOverride(sessionID)).toBeUndefined();
  });
});
