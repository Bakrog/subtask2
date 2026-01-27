import { describe, it, expect, beforeEach } from "bun:test";
import { toolExecuteAfter } from "../../src/hooks/tool-hooks";
import {
  setConfigs,
  setClient,
  setCallState,
  setSessionMainCommand,
  registerPendingResultCapture,
  getSubtaskResult,
  clearSubtaskResults,
} from "../../src/core/state";

describe("toolExecuteAfter result capture", () => {
  const sessionID = "subtask-session";
  const parentSessionID = "parent-session";
  const callID = "call-result";

  beforeEach(() => {
    setConfigs({
      plan: {
        return: [],
        parallel: [],
      },
    });
    clearSubtaskResults(parentSessionID);
  });

  it("captures assistant output using info.role", async () => {
    setClient({
      session: {
        messages: async () => ({
          data: [
            {
              info: { role: "assistant" },
              parts: [{ type: "text", text: "Subtask result" }],
            },
          ],
        }),
      },
    });

    registerPendingResultCapture(sessionID, parentSessionID, "analysis");
    setCallState(callID, "plan");
    setSessionMainCommand(sessionID, "plan");

    await toolExecuteAfter({ tool: "task", callID, sessionID }, {});

    expect(getSubtaskResult(parentSessionID, "analysis")).toBe(
      "Subtask result"
    );
  });
});
