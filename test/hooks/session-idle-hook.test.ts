import { describe, it, expect, beforeEach } from "bun:test";
import { handleSessionIdle } from "../../src/hooks/session-idle-hook";
import {
  setClient,
  registerPendingMainSessionCapture,
  getSubtaskResult,
  clearSubtaskResults,
} from "../../src/core/state";

describe("session idle main result capture", () => {
  const sessionID = "main-session";

  beforeEach(() => {
    clearSubtaskResults(sessionID);
  });

  it("stores main session result using info.role", async () => {
    setClient({
      session: {
        messages: async () => ({
          data: [
            {
              info: { role: "assistant" },
              parts: [{ type: "text", text: "Main result" }],
            },
          ],
        }),
      },
    });

    registerPendingMainSessionCapture(sessionID, "summary");
    await handleSessionIdle(sessionID);

    expect(getSubtaskResult(sessionID, "summary")).toBe("Main result");
  });
});
