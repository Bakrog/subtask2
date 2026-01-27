import { describe, it, expect } from "bun:test";
import {
  parseLoopConfig,
  parseParallelItem,
  parseParallelConfig,
} from "../../src/parsing/parallel";

describe("parseLoopConfig", () => {
  it("parses number as max iterations", () => {
    const result = parseLoopConfig(10);
    expect(result).toEqual({ max: 10, until: "" });
  });

  it("parses object with max and until", () => {
    const result = parseLoopConfig({ max: 5, until: "tests pass" });
    expect(result).toEqual({ max: 5, until: "tests pass" });
  });

  it("defaults max to 10 when not specified in object", () => {
    const result = parseLoopConfig({ until: "done" });
    expect(result).toEqual({ max: 10, until: "done" });
  });

  it("defaults until to empty string when not specified", () => {
    const result = parseLoopConfig({ max: 3 });
    expect(result).toEqual({ max: 3, until: "" });
  });

  it("returns undefined for null", () => {
    expect(parseLoopConfig(null)).toBeUndefined();
  });

  it("returns undefined for undefined", () => {
    expect(parseLoopConfig(undefined)).toBeUndefined();
  });

  it("returns undefined for zero", () => {
    expect(parseLoopConfig(0)).toBeUndefined();
  });

  it("returns undefined for negative numbers", () => {
    expect(parseLoopConfig(-5)).toBeUndefined();
  });

  it("returns undefined for invalid object with zero max", () => {
    expect(parseLoopConfig({ max: 0 })).toBeUndefined();
  });

  it("handles string until correctly", () => {
    const result = parseLoopConfig({
      max: 5,
      until: "all features implemented",
    });
    expect(result?.until).toBe("all features implemented");
  });
});

describe("parseParallelItem", () => {
  it("parses simple command string", () => {
    const result = parseParallelItem("/plan-gemini");
    expect(result).toEqual({ command: "plan-gemini", arguments: undefined });
  });

  it("parses command with arguments", () => {
    const result = parseParallelItem("/research focus on auth");
    expect(result).toEqual({ command: "research", arguments: "focus on auth" });
  });

  it("parses command with model override", () => {
    const result = parseParallelItem("/plan {model:openai/gpt-4o} design auth");
    expect(result?.command).toBe("plan");
    expect(result?.arguments).toBe("design auth");
    expect(result?.model).toBe("openai/gpt-4o");
  });

  it("parses command with loop override", () => {
    const result = parseParallelItem("/test {loop:5} run suite");
    expect(result?.command).toBe("test");
    expect(result?.loop).toEqual({ max: 5, until: "" });
  });

  it("parses non-slash command string", () => {
    const result = parseParallelItem("plain-cmd");
    expect(result).toEqual({ command: "plain-cmd" });
  });

  it("parses object format with command and arguments", () => {
    const result = parseParallelItem({
      command: "research",
      arguments: "auth patterns",
    });
    expect(result).toEqual({ command: "research", arguments: "auth patterns" });
  });

  it("parses object format with model", () => {
    const result = parseParallelItem({
      command: "plan",
      model: "anthropic/claude-sonnet-4",
    });
    expect(result?.model).toBe("anthropic/claude-sonnet-4");
  });

  it("returns null for null input", () => {
    expect(parseParallelItem(null)).toBeNull();
  });

  it("returns null for object without command", () => {
    expect(parseParallelItem({ arguments: "something" })).toBeNull();
  });

  it("handles whitespace in command strings", () => {
    const result = parseParallelItem("  /cmd args  ");
    expect(result?.command).toBe("cmd");
  });

  it("returns null for object without command", () => {
    expect(parseParallelItem({ arguments: "something" })).toBeNull();
  });

  it("parses comma-separated string", () => {
    const result = parseParallelConfig("/cmd1, /cmd2, /cmd3");
    expect(result).toHaveLength(3);
    expect(result[0].command).toBe("cmd1");
    expect(result[1].command).toBe("cmd2");
    expect(result[2].command).toBe("cmd3");
  });

  it("parses mixed array with objects and strings", () => {
    const result = parseParallelConfig([
      "/simple",
      { command: "complex", arguments: "args" },
    ]);
    expect(result).toHaveLength(2);
    expect(result[0].command).toBe("simple");
    expect(result[1]).toEqual({ command: "complex", arguments: "args" });
  });

  it("filters out null items", () => {
    const result = parseParallelConfig(["/valid", null, { notCommand: true }]);
    expect(result).toHaveLength(1);
    expect(result[0].command).toBe("valid");
  });

  it("returns empty array for undefined", () => {
    expect(parseParallelConfig(undefined)).toEqual([]);
  });

  it("returns empty array for null", () => {
    expect(parseParallelConfig(null)).toEqual([]);
  });

  it("returns empty array for empty array", () => {
    expect(parseParallelConfig([])).toEqual([]);
  });

  it("returns empty array for empty string", () => {
    expect(parseParallelConfig("")).toEqual([]);
  });

  it("returns empty array for non-array/non-string types", () => {
    // Test with object (neither array nor string)
    expect(parseParallelConfig({ some: "object" } as any)).toEqual([]);
    // Test with number
    expect(parseParallelConfig(123 as any)).toEqual([]);
    // Test with boolean
    expect(parseParallelConfig(true as any)).toEqual([]);
  });

  it("parses commands with inline arguments", () => {
    const result = parseParallelConfig(
      "/security-review focus on auth, /perf-review check db queries"
    );
    expect(result).toHaveLength(2);
    expect(result[0].arguments).toBe("focus on auth");
    expect(result[1].arguments).toBe("check db queries");
  });
});
