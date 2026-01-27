import { describe, it, expect, beforeEach } from "bun:test";
import { toolExecuteAfter } from "../../src/hooks/tool-hooks";
import {
  setConfigs,
  setSessionMainCommand,
  setCallState,
  getPendingReturn,
  getDeferredReturnPrompt,
} from "../../src/core/state";
import { startLoop, clearLoop } from "../../src/loop";

describe("toolExecuteAfter loop return deferral", () => {
  const sessionID = "session-loop";
  const callID = "call-1";

  beforeEach(() => {
    setConfigs({
      "fix-tests": {
        return: ["Return prompt"],
        parallel: [],
      },
    });
    clearLoop(sessionID);
  });

  it("defers main return while loop is active", async () => {
    setSessionMainCommand(sessionID, "fix-tests");
    setCallState(callID, "fix-tests");
    startLoop(sessionID, { max: 3, until: "done" }, "fix-tests", "args");

    await toolExecuteAfter({ tool: "task", callID, sessionID }, {});

    expect(getPendingReturn(sessionID)).toBeUndefined();
    expect(getDeferredReturnPrompt(sessionID)).toBe("Return prompt");
  });
});
