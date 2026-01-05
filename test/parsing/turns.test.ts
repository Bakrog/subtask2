import { describe, it, expect } from "bun:test";
import {
  extractTurnReferences,
  hasTurnReferences,
  replaceTurnReferences,
  type TurnReference,
} from "../../src/parsing/turns";

describe("extractTurnReferences", () => {
  it("extracts $TURN[n] - last N messages", () => {
    const refs = extractTurnReferences("Check $TURN[5] for context");
    expect(refs).toHaveLength(1);
    expect(refs[0]).toEqual({ type: "lastN", match: "$TURN[5]", count: 5 });
  });

  it("extracts $TURN[:n] - specific index", () => {
    const refs = extractTurnReferences("Look at $TURN[:3]");
    expect(refs).toHaveLength(1);
    expect(refs[0]).toEqual({
      type: "specific",
      match: "$TURN[:3]",
      indices: [3],
    });
  });

  it("extracts $TURN[:2:5:8] - multiple specific indices", () => {
    const refs = extractTurnReferences("Messages $TURN[:2:5:8] are important");
    expect(refs).toHaveLength(1);
    expect(refs[0]).toEqual({
      type: "specific",
      match: "$TURN[:2:5:8]",
      indices: [2, 5, 8],
    });
  });

  it("extracts $TURN[*] - all messages", () => {
    const refs = extractTurnReferences("Full history: $TURN[*]");
    expect(refs).toHaveLength(1);
    expect(refs[0]).toEqual({ type: "all", match: "$TURN[*]" });
  });

  it("extracts multiple references in same string", () => {
    const refs = extractTurnReferences("Compare $TURN[3] with $TURN[:1]");
    expect(refs).toHaveLength(2);
    expect(refs[0].type).toBe("lastN");
    expect(refs[1].type).toBe("specific");
  });

  it("returns empty array for no references", () => {
    const refs = extractTurnReferences("No references here");
    expect(refs).toHaveLength(0);
  });

  it("handles large numbers", () => {
    const refs = extractTurnReferences("$TURN[100]");
    expect(refs).toHaveLength(1);
    expect(refs[0]).toEqual({ type: "lastN", match: "$TURN[100]", count: 100 });
  });

  it("handles multiple specific indices with varying values", () => {
    const refs = extractTurnReferences("$TURN[:1:10:100]");
    expect(refs[0]).toEqual({
      type: "specific",
      match: "$TURN[:1:10:100]",
      indices: [1, 10, 100],
    });
  });

  it("ignores invalid patterns", () => {
    const refs = extractTurnReferences("$TURN[] $TURN[abc] TURN[5]");
    expect(refs).toHaveLength(0);
  });
});

describe("hasTurnReferences", () => {
  it("returns true for $TURN[n]", () => {
    expect(hasTurnReferences("Check $TURN[5]")).toBe(true);
  });

  it("returns true for $TURN[:n]", () => {
    expect(hasTurnReferences("Check $TURN[:3]")).toBe(true);
  });

  it("returns true for $TURN[*]", () => {
    expect(hasTurnReferences("Check $TURN[*]")).toBe(true);
  });

  it("returns false for no references", () => {
    expect(hasTurnReferences("No TURN references")).toBe(false);
  });

  it("returns false for partial matches", () => {
    expect(hasTurnReferences("$TURN without brackets")).toBe(false);
    expect(hasTurnReferences("TURN[5] without dollar")).toBe(false);
  });
});

describe("replaceTurnReferences", () => {
  it("replaces single reference", () => {
    const replacements = new Map([["$TURN[3]", "--- USER ---\nHello"]]);
    const result = replaceTurnReferences("Context: $TURN[3]", replacements);
    expect(result).toBe("Context: --- USER ---\nHello");
  });

  it("replaces multiple references", () => {
    const replacements = new Map([
      ["$TURN[2]", "Message A"],
      ["$TURN[:1]", "Message B"],
    ]);
    const result = replaceTurnReferences(
      "First: $TURN[2], Second: $TURN[:1]",
      replacements
    );
    expect(result).toBe("First: Message A, Second: Message B");
  });

  it("handles missing replacements gracefully", () => {
    const replacements = new Map([["$TURN[3]", "replaced"]]);
    const result = replaceTurnReferences("$TURN[5] stays", replacements);
    expect(result).toBe("$TURN[5] stays");
  });

  it("replaces all occurrences of same pattern", () => {
    const replacements = new Map([["$TURN[1]", "X"]]);
    const result = replaceTurnReferences("$TURN[1] and $TURN[1]", replacements);
    expect(result).toBe("X and X");
  });

  it("handles empty replacements map", () => {
    const result = replaceTurnReferences("$TURN[5] unchanged", new Map());
    expect(result).toBe("$TURN[5] unchanged");
  });

  it("handles multiline replacement content", () => {
    const replacements = new Map([
      ["$TURN[2]", "--- USER ---\nLine 1\nLine 2\n--- ASSISTANT ---\nResponse"],
    ]);
    const result = replaceTurnReferences("History:\n$TURN[2]", replacements);
    expect(result).toBe(
      "History:\n--- USER ---\nLine 1\nLine 2\n--- ASSISTANT ---\nResponse"
    );
  });
});
