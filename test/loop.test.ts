import { describe, it, expect, beforeEach } from "bun:test";
import {
  parseLoopDecision,
  startLoop,
  getLoopState,
  incrementLoopIteration,
  clearLoop,
  isMaxIterationsReached,
  setPendingEvaluation,
  getPendingEvaluation,
  clearPendingEvaluation,
  getAllPendingEvaluations,
} from "../src/loop";

describe("parseLoopDecision", () => {
  it("returns 'break' for <subtask2 loop=break/>", () => {
    expect(parseLoopDecision("Some text <subtask2 loop=break/> more text")).toBe(
      "break"
    );
  });

  it('returns "break" for <subtask2 loop="break"/>', () => {
    expect(
      parseLoopDecision('The condition is met. <subtask2 loop="break"/>')
    ).toBe("break");
  });

  it("returns 'break' for <subtask2 loop='break'/>", () => {
    expect(parseLoopDecision("<subtask2 loop='break'/>")).toBe("break");
  });

  it("returns 'break' for tag without self-closing", () => {
    expect(parseLoopDecision("<subtask2 loop=break>")).toBe("break");
  });

  it("returns 'continue' when no break signal", () => {
    expect(parseLoopDecision("Working on it, more work needed")).toBe(
      "continue"
    );
  });

  it("returns 'continue' for empty string", () => {
    expect(parseLoopDecision("")).toBe("continue");
  });

  it("returns 'continue' for continue signal (defaults to continue)", () => {
    expect(parseLoopDecision("<subtask2 loop=continue/>")).toBe("continue");
  });

  it("is case-insensitive", () => {
    expect(parseLoopDecision("<SUBTASK2 LOOP=BREAK/>")).toBe("break");
  });

  it("handles multiline content", () => {
    const output = `I've checked the tests.
All tests pass now.
<subtask2 loop="break"/>
Great work!`;
    expect(parseLoopDecision(output)).toBe("break");
  });
});

describe("loop state management", () => {
  const sessionId = "test-session-123";

  beforeEach(() => {
    clearLoop(sessionId);
    clearPendingEvaluation(sessionId);
  });

  describe("startLoop and getLoopState", () => {
    it("starts a loop with given config", () => {
      startLoop(
        sessionId,
        { max: 5, until: "tests pass" },
        "fix-tests",
        "run suite",
        "openai/gpt-4o",
        "build"
      );

      const state = getLoopState(sessionId);
      expect(state).toBeDefined();
      expect(state?.config).toEqual({ max: 5, until: "tests pass" });
      expect(state?.iteration).toBe(1);
      expect(state?.commandName).toBe("fix-tests");
      expect(state?.arguments).toBe("run suite");
      expect(state?.model).toBe("openai/gpt-4o");
      expect(state?.agent).toBe("build");
    });

    it("returns undefined for non-existent session", () => {
      expect(getLoopState("non-existent")).toBeUndefined();
    });

    it("handles optional model and agent", () => {
      startLoop(sessionId, { max: 3, until: "" }, "cmd", "args");
      const state = getLoopState(sessionId);
      expect(state?.model).toBeUndefined();
      expect(state?.agent).toBeUndefined();
    });
  });

  describe("incrementLoopIteration", () => {
    it("increments iteration count", () => {
      startLoop(sessionId, { max: 5, until: "" }, "cmd", "args");
      expect(getLoopState(sessionId)?.iteration).toBe(1);

      const newIter = incrementLoopIteration(sessionId);
      expect(newIter).toBe(2);
      expect(getLoopState(sessionId)?.iteration).toBe(2);
    });

    it("returns 0 for non-existent session", () => {
      expect(incrementLoopIteration("non-existent")).toBe(0);
    });
  });

  describe("clearLoop", () => {
    it("removes loop state", () => {
      startLoop(sessionId, { max: 5, until: "" }, "cmd", "args");
      expect(getLoopState(sessionId)).toBeDefined();

      clearLoop(sessionId);
      expect(getLoopState(sessionId)).toBeUndefined();
    });

    it("is safe to call on non-existent session", () => {
      expect(() => clearLoop("non-existent")).not.toThrow();
    });
  });

  describe("isMaxIterationsReached", () => {
    it("returns true when iteration >= max", () => {
      startLoop(sessionId, { max: 2, until: "" }, "cmd", "args");
      expect(isMaxIterationsReached(sessionId)).toBe(false);

      incrementLoopIteration(sessionId); // now 2
      expect(isMaxIterationsReached(sessionId)).toBe(true);
    });

    it("returns true for non-existent session", () => {
      expect(isMaxIterationsReached("non-existent")).toBe(true);
    });
  });

  describe("pending evaluation", () => {
    it("sets and gets pending evaluation", () => {
      const state = {
        config: { max: 5, until: "done" },
        iteration: 2,
        commandName: "cmd",
        arguments: "args",
      };

      setPendingEvaluation(sessionId, state);
      expect(getPendingEvaluation(sessionId)).toEqual(state);
    });

    it("returns undefined for non-existent pending", () => {
      expect(getPendingEvaluation("non-existent")).toBeUndefined();
    });

    it("clears pending evaluation", () => {
      setPendingEvaluation(sessionId, {
        config: { max: 1, until: "" },
        iteration: 1,
        commandName: "x",
        arguments: "y",
      });
      clearPendingEvaluation(sessionId);
      expect(getPendingEvaluation(sessionId)).toBeUndefined();
    });

    it("getAllPendingEvaluations returns the map", () => {
      const state = {
        config: { max: 3, until: "test" },
        iteration: 1,
        commandName: "cmd",
        arguments: "",
      };
      setPendingEvaluation(sessionId, state);

      const all = getAllPendingEvaluations();
      expect(all instanceof Map).toBe(true);
      expect(all.get(sessionId)).toEqual(state);
    });
  });
});
