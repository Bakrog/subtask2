import { describe, it, expect, beforeEach } from "bun:test";
import {
  hasResultReferences,
  resolveResultReferences,
} from "../../src/features/results";
import {
  captureSubtaskResult,
  clearSubtaskResults,
  registerPendingResultCapture,
} from "../../src/core/state";

describe("hasResultReferences", () => {
  it("returns true when $RESULT[name] is present", () => {
    expect(hasResultReferences("Use $RESULT[plan] to continue")).toBe(true);
  });

  it("returns true for multiple references", () => {
    expect(hasResultReferences("Compare $RESULT[a] and $RESULT[b]")).toBe(true);
  });

  it("returns false when no references", () => {
    expect(hasResultReferences("No references here")).toBe(false);
  });

  it("returns false for partial match", () => {
    expect(hasResultReferences("$RESULT without brackets")).toBe(false);
  });
});

describe("resolveResultReferences", () => {
  const parentSessionID = "parent-session-123";
  const subtaskSessionID = "subtask-session-456";

  beforeEach(() => {
    clearSubtaskResults(parentSessionID);
  });

  it("resolves single $RESULT[name] reference", () => {
    registerPendingResultCapture(subtaskSessionID, parentSessionID, "plan");
    captureSubtaskResult(subtaskSessionID, "The implementation plan...");
    const result = resolveResultReferences(
      "Review $RESULT[plan] and continue",
      parentSessionID
    );
    expect(result).toBe("Review The implementation plan... and continue");
  });

  it("resolves multiple different references", () => {
    registerPendingResultCapture("subtask-1", parentSessionID, "claude-plan");
    registerPendingResultCapture("subtask-2", parentSessionID, "gpt-plan");
    captureSubtaskResult("subtask-1", "Claude says X");
    captureSubtaskResult("subtask-2", "GPT says Y");
    const result = resolveResultReferences(
      "Compare $RESULT[claude-plan] vs $RESULT[gpt-plan]",
      parentSessionID
    );
    expect(result).toBe("Compare Claude says X vs GPT says Y");
  });

  it("replaces missing reference with placeholder", () => {
    const result = resolveResultReferences(
      "Use $RESULT[missing]",
      parentSessionID
    );
    expect(result).toBe("Use [Result 'missing' not found]");
  });

  it("returns original text when no references", () => {
    const text = "No references here";
    expect(resolveResultReferences(text, parentSessionID)).toBe(text);
  });

  it("handles mixed found and missing references", () => {
    registerPendingResultCapture(subtaskSessionID, parentSessionID, "found");
    captureSubtaskResult(subtaskSessionID, "FOUND");
    const result = resolveResultReferences(
      "$RESULT[found] and $RESULT[missing]",
      parentSessionID
    );
    expect(result).toBe("FOUND and [Result 'missing' not found]");
  });
});
