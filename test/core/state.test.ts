import { describe, it, expect, beforeEach } from "bun:test";
import {
  getConfigs,
  setConfigs,
  getPluginConfig,
  setPluginConfig,
  getClient,
  setClient,
  getCallState,
  setCallState,
  deleteCallState,
  getReturnState,
  setReturnState,
  hasReturnState,
  deleteReturnState,
  pushReturnStack,
  peekReturnStack,
  popReturnStack,
  hasReturnStack,
  shiftReturnStack,
  clearReturnStack,
  getPendingReturn,
  setPendingReturn,
  hasPendingReturn,
  deletePendingReturn,
  getAllPendingReturns,
  getPendingNonSubtaskReturns,
  setPendingNonSubtaskReturns,
  deletePendingNonSubtaskReturns,
  getPipedArgsQueue,
  setPipedArgsQueue,
  deletePipedArgsQueue,
  getReturnArgsState,
  deleteReturnArgsState,
  getSessionMainCommand,
  setSessionMainCommand,
  hasProcessedS2Message,
  addProcessedS2Message,
  hasExecutedReturn,
  addExecutedReturn,
  deleteExecutedReturn,
  getFirstReturnPrompt,
  setFirstReturnPrompt,
  getSubtaskParentSession,
  setSubtaskParentSession,
  deleteSubtaskParentSession,
  registerPendingParentForPrompt,
  consumePendingParentForPrompt,
  getHasActiveSubtask,
  setHasActiveSubtask,
  getPendingModelOverride,
  setPendingModelOverride,
  deletePendingModelOverride,
  getLastReturnWasCommand,
  setLastReturnWasCommand,
  deleteLastReturnWasCommand,
} from "../../src/core/state";

describe("state management", () => {
  const sessionId = "test-session";

  describe("configs", () => {
    it("sets and gets configs", () => {
      const configs = { plan: { return: ["done"], parallel: [] } };
      setConfigs(configs);
      expect(getConfigs()).toEqual(configs);
    });
  });

  describe("pluginConfig", () => {
    it("sets and gets plugin config", () => {
      setPluginConfig({ replace_generic: true, generic_return: "custom" });
      const config = getPluginConfig();
      expect(config.replace_generic).toBe(true);
      expect(config.generic_return).toBe("custom");
    });
  });

  describe("client", () => {
    it("sets and gets client", () => {
      const mockClient = { session: { command: () => {} } };
      setClient(mockClient);
      expect(getClient()).toBe(mockClient);
    });
  });

  describe("call state", () => {
    const callId = "call-123";

    it("sets and gets call state", () => {
      setCallState(callId, "plan");
      expect(getCallState(callId)).toBe("plan");
    });

    it("deletes call state", () => {
      setCallState(callId, "cmd");
      deleteCallState(callId);
      expect(getCallState(callId)).toBeUndefined();
    });

    it("returns undefined for non-existent", () => {
      expect(getCallState("non-existent")).toBeUndefined();
    });
  });

  describe("return state", () => {
    beforeEach(() => {
      deleteReturnState(sessionId);
    });

    it("sets and gets return state", () => {
      setReturnState(sessionId, ["step1", "step2"]);
      expect(getReturnState(sessionId)).toEqual(["step1", "step2"]);
    });

    it("hasReturnState returns correctly", () => {
      expect(hasReturnState(sessionId)).toBe(false);
      setReturnState(sessionId, ["x"]);
      expect(hasReturnState(sessionId)).toBe(true);
    });

    it("deletes return state", () => {
      setReturnState(sessionId, ["x"]);
      deleteReturnState(sessionId);
      expect(hasReturnState(sessionId)).toBe(false);
    });
  });

  describe("return stack", () => {
    beforeEach(() => {
      clearReturnStack(sessionId);
    });

    it("pushes and peeks return chain", () => {
      pushReturnStack(sessionId, ["a", "b"]);
      expect(peekReturnStack(sessionId)).toEqual(["a", "b"]);
    });

    it("supports multiple stacked chains", () => {
      pushReturnStack(sessionId, ["outer1", "outer2"]);
      pushReturnStack(sessionId, ["inner1", "inner2"]);
      expect(peekReturnStack(sessionId)).toEqual(["inner1", "inner2"]);
    });

    it("pops return chain", () => {
      pushReturnStack(sessionId, ["outer"]);
      pushReturnStack(sessionId, ["inner"]);
      popReturnStack(sessionId);
      expect(peekReturnStack(sessionId)).toEqual(["outer"]);
    });

    it("hasReturnStack returns correctly", () => {
      expect(hasReturnStack(sessionId)).toBe(false);
      pushReturnStack(sessionId, ["x"]);
      expect(hasReturnStack(sessionId)).toBe(true);
    });

    it("shiftReturnStack removes first item from current chain", () => {
      pushReturnStack(sessionId, ["a", "b", "c"]);
      expect(shiftReturnStack(sessionId)).toBe("a");
      expect(peekReturnStack(sessionId)).toEqual(["b", "c"]);
    });

    it("shiftReturnStack pops chain when empty", () => {
      pushReturnStack(sessionId, ["outer"]);
      pushReturnStack(sessionId, ["only"]);
      expect(shiftReturnStack(sessionId)).toBe("only");
      expect(peekReturnStack(sessionId)).toEqual(["outer"]);
    });

    it("shiftReturnStack returns undefined when chain is already empty", () => {
      // Push an empty chain manually - this tests line 166-171
      pushReturnStack(sessionId, []);
      expect(shiftReturnStack(sessionId)).toBeUndefined();
    });

    it("shiftReturnStack returns undefined when no stack", () => {
      expect(shiftReturnStack(sessionId)).toBeUndefined();
    });

    it("clearReturnStack removes all chains", () => {
      pushReturnStack(sessionId, ["a"]);
      pushReturnStack(sessionId, ["b"]);
      clearReturnStack(sessionId);
      expect(hasReturnStack(sessionId)).toBe(false);
    });

    it("popReturnStack is safe on empty stack", () => {
      expect(() => popReturnStack(sessionId)).not.toThrow();
    });

    it("popReturnStack deletes map entry when last chain removed", () => {
      pushReturnStack(sessionId, ["only"]);
      popReturnStack(sessionId);
      expect(hasReturnStack(sessionId)).toBe(false);
    });

    it("returns undefined for empty chain in stack", () => {
      pushReturnStack(sessionId, ["x"]);
      shiftReturnStack(sessionId);
      expect(peekReturnStack(sessionId)).toBeUndefined();
    });
  });

  describe("pending returns", () => {
    beforeEach(() => {
      deletePendingReturn(sessionId);
    });

    it("sets and gets pending return", () => {
      setPendingReturn(sessionId, "Do the thing");
      expect(getPendingReturn(sessionId)).toBe("Do the thing");
    });

    it("hasPendingReturn returns correctly", () => {
      expect(hasPendingReturn(sessionId)).toBe(false);
      setPendingReturn(sessionId, "x");
      expect(hasPendingReturn(sessionId)).toBe(true);
    });

    it("deletes pending return", () => {
      setPendingReturn(sessionId, "x");
      deletePendingReturn(sessionId);
      expect(hasPendingReturn(sessionId)).toBe(false);
    });

    it("getAllPendingReturns returns iterator", () => {
      setPendingReturn(sessionId, "first");
      setPendingReturn("other-session", "second");
      const entries = Array.from(getAllPendingReturns());
      expect(entries.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("pending non-subtask returns", () => {
    beforeEach(() => {
      deletePendingNonSubtaskReturns(sessionId);
    });

    it("sets and gets pending non-subtask returns", () => {
      setPendingNonSubtaskReturns(sessionId, ["step1", "step2"]);
      expect(getPendingNonSubtaskReturns(sessionId)).toEqual([
        "step1",
        "step2",
      ]);
    });

    it("deletes pending non-subtask returns", () => {
      setPendingNonSubtaskReturns(sessionId, ["x"]);
      deletePendingNonSubtaskReturns(sessionId);
      expect(getPendingNonSubtaskReturns(sessionId)).toBeUndefined();
    });

    it("returns undefined for non-existent", () => {
      expect(getPendingNonSubtaskReturns("non-existent")).toBeUndefined();
    });
  });

  describe("piped args queue", () => {
    beforeEach(() => {
      deletePipedArgsQueue(sessionId);
    });

    it("sets and gets piped args", () => {
      setPipedArgsQueue(sessionId, ["arg1", "arg2", "arg3"]);
      expect(getPipedArgsQueue(sessionId)).toEqual(["arg1", "arg2", "arg3"]);
    });

    it("deletes piped args", () => {
      setPipedArgsQueue(sessionId, ["x"]);
      deletePipedArgsQueue(sessionId);
      expect(getPipedArgsQueue(sessionId)).toBeUndefined();
    });
  });

  describe("return args state", () => {
    beforeEach(() => {
      deleteReturnArgsState(sessionId);
    });

    it("returns undefined for non-existent", () => {
      expect(getReturnArgsState(sessionId)).toBeUndefined();
    });

    it("deletes return args state", () => {
      expect(() => deleteReturnArgsState(sessionId)).not.toThrow();
    });
  });

  describe("session main command", () => {
    it("sets and gets session main command", () => {
      setSessionMainCommand(sessionId, "plan");
      expect(getSessionMainCommand(sessionId)).toBe("plan");
    });
  });

  describe("processed S2 messages", () => {
    const msgId = "msg-123";

    it("tracks processed messages", () => {
      expect(hasProcessedS2Message(msgId)).toBe(false);
      addProcessedS2Message(msgId);
      expect(hasProcessedS2Message(msgId)).toBe(true);
    });
  });

  describe("executed returns", () => {
    const key = "session:return-key";

    it("tracks executed returns", () => {
      expect(hasExecutedReturn(key)).toBe(false);
      addExecutedReturn(key);
      expect(hasExecutedReturn(key)).toBe(true);
    });

    it("deletes executed return", () => {
      addExecutedReturn(key);
      deleteExecutedReturn(key);
      expect(hasExecutedReturn(key)).toBe(false);
    });
  });

  describe("first return prompt", () => {
    it("sets and gets first return prompt", () => {
      setFirstReturnPrompt(sessionId, "Initial prompt");
      expect(getFirstReturnPrompt(sessionId)).toBe("Initial prompt");
    });

    it("returns undefined for non-existent", () => {
      expect(getFirstReturnPrompt("non-existent")).toBeUndefined();
    });
  });

  describe("subtask parent session", () => {
    beforeEach(() => {
      deleteSubtaskParentSession(sessionId);
    });

    it("sets and gets parent session", () => {
      setSubtaskParentSession(sessionId, "parent-id");
      expect(getSubtaskParentSession(sessionId)).toBe("parent-id");
    });

    it("deletes parent session", () => {
      setSubtaskParentSession(sessionId, "parent");
      deleteSubtaskParentSession(sessionId);
      expect(getSubtaskParentSession(sessionId)).toBeUndefined();
    });

    it("returns undefined for non-existent", () => {
      expect(getSubtaskParentSession("non-existent")).toBeUndefined();
    });
  });

  describe("pending parent for prompt", () => {
    const prompt = "Do the task";
    const parentSession = "parent-123";

    it("registers and consumes parent session", () => {
      registerPendingParentForPrompt(prompt, parentSession);
      expect(consumePendingParentForPrompt(prompt)).toBe(parentSession);
    });

    it("consumes removes the mapping", () => {
      registerPendingParentForPrompt(prompt, parentSession);
      consumePendingParentForPrompt(prompt);
      expect(consumePendingParentForPrompt(prompt)).toBeNull();
    });

    it("returns null for unknown prompt", () => {
      expect(consumePendingParentForPrompt("unknown")).toBeNull();
    });
  });

  describe("has active subtask", () => {
    it("sets and gets active subtask flag", () => {
      setHasActiveSubtask(false);
      expect(getHasActiveSubtask()).toBe(false);
      setHasActiveSubtask(true);
      expect(getHasActiveSubtask()).toBe(true);
    });
  });

  describe("pending model override", () => {
    beforeEach(() => {
      deletePendingModelOverride(sessionId);
    });

    it("sets and gets model override", () => {
      setPendingModelOverride(sessionId, "openai/gpt-4o");
      expect(getPendingModelOverride(sessionId)).toBe("openai/gpt-4o");
    });

    it("deletes model override", () => {
      setPendingModelOverride(sessionId, "x");
      deletePendingModelOverride(sessionId);
      expect(getPendingModelOverride(sessionId)).toBeUndefined();
    });
  });

  describe("last return was command", () => {
    beforeEach(() => {
      deleteLastReturnWasCommand(sessionId);
    });

    it("sets and gets flag", () => {
      setLastReturnWasCommand(sessionId, true);
      expect(getLastReturnWasCommand(sessionId)).toBe(true);
      setLastReturnWasCommand(sessionId, false);
      expect(getLastReturnWasCommand(sessionId)).toBe(false);
    });

    it("deletes flag", () => {
      setLastReturnWasCommand(sessionId, true);
      deleteLastReturnWasCommand(sessionId);
      expect(getLastReturnWasCommand(sessionId)).toBeUndefined();
    });
  });
});
