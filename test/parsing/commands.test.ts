import { describe, it, expect } from "bun:test";
import {
  parseCommandWithOverrides,
  parseInlineSubtask,
} from "../../src/parsing/commands";

describe("parseCommandWithOverrides", () => {
  it("parses simple command without overrides", () => {
    const result = parseCommandWithOverrides("/plan");
    expect(result.command).toBe("plan");
    expect(result.arguments).toBeUndefined();
    expect(result.overrides).toEqual({});
  });

  it("parses command with arguments", () => {
    const result = parseCommandWithOverrides("/plan design auth system");
    expect(result.command).toBe("plan");
    expect(result.arguments).toBe("design auth system");
  });

  it("parses command with model override", () => {
    const result = parseCommandWithOverrides(
      "/plan {model:openai/gpt-4o} design auth"
    );
    expect(result.command).toBe("plan");
    expect(result.arguments).toBe("design auth");
    expect(result.overrides.model).toBe("openai/gpt-4o");
  });

  it("parses command with agent override", () => {
    const result = parseCommandWithOverrides(
      "/research {agent:explore} find patterns"
    );
    expect(result.command).toBe("research");
    expect(result.overrides.agent).toBe("explore");
  });

  it("parses command with loop override", () => {
    const result = parseCommandWithOverrides("/fix-tests {loop:5} run suite");
    expect(result.overrides.loop).toEqual({ max: 5, until: "" });
  });

  it("parses command with loop and until", () => {
    const result = parseCommandWithOverrides(
      "/fix-tests {loop:10 && until:all tests pass} fix bugs"
    );
    expect(result.overrides.loop).toEqual({ max: 10, until: "all tests pass" });
  });

  it("parses command with multiple overrides", () => {
    const result = parseCommandWithOverrides(
      "/impl {model:anthropic/claude-sonnet-4 && agent:build} implement feature"
    );
    expect(result.overrides.model).toBe("anthropic/claude-sonnet-4");
    expect(result.overrides.agent).toBe("build");
  });

  it("parses inline subtask syntax", () => {
    const result = parseCommandWithOverrides(
      "/subtask {model:openai/gpt-4o && return:validate || test} implement auth"
    );
    expect(result.isInlineSubtask).toBe(true);
    expect(result.command).toBe("");
    expect(result.arguments).toBe("implement auth");
    expect(result.overrides.model).toBe("openai/gpt-4o");
    expect(result.overrides.return).toEqual(["validate", "test"]);
  });

  it("handles case-insensitive /subtask", () => {
    const result = parseCommandWithOverrides("/SUBTASK {agent:build} do thing");
    expect(result.isInlineSubtask).toBe(true);
  });

  it("handles non-slash input", () => {
    const result = parseCommandWithOverrides("plain text");
    expect(result.command).toBe("plain text");
    expect(result.overrides).toEqual({});
  });

  it("handles command with hyphen and slash in name", () => {
    const result = parseCommandWithOverrides("/my-command/sub args");
    expect(result.command).toBe("my-command/sub");
    expect(result.arguments).toBe("args");
  });

  it("handles command name with underscores", () => {
    const result = parseCommandWithOverrides("/my_command test args");
    expect(result.command).toBe("my_command");
    expect(result.arguments).toBe("test args");
  });

  it("handles command name with multiple hyphens", () => {
    const result = parseCommandWithOverrides("/my-long-command-name args");
    expect(result.command).toBe("my-long-command-name");
    expect(result.arguments).toBe("args");
  });

  it("handles empty arguments", () => {
    const result = parseCommandWithOverrides("/cmd {model:x}");
    expect(result.command).toBe("cmd");
    expect(result.arguments).toBeUndefined();
  });

  it("fallback: handles slash with special char only (regex doesn't match)", () => {
    // The main regex requires [a-zA-Z0-9_\-\/]+ so this triggers fallback
    const result = parseCommandWithOverrides("/@#$ args here");
    expect(result.command).toBe("@#$");
    expect(result.arguments).toBe("args here");
  });

  it("fallback: handles command with only special chars no args", () => {
    const result = parseCommandWithOverrides("/!@#");
    expect(result.command).toBe("!@#");
    expect(result.arguments).toBeUndefined();
  });

  it("fallback: handles slash followed by space and text", () => {
    // Edge case: "/ something" - slash then space triggers fallback
    const result = parseCommandWithOverrides("/ args");
    expect(result.command).toBe("");
    expect(result.arguments).toBe("args");
  });

  it("parses command names stopping at unsupported chars", () => {
    // Dots and @ are not allowed in command names, so parsing stops there
    const result = parseCommandWithOverrides("/file.test more args");
    expect(result.command).toBe("file");
    expect(result.arguments).toBe(".test more args");
  });

  it("parses complex inline subtask with all params", () => {
    const result = parseCommandWithOverrides(
      "/subtask {model:openai/gpt-4o && agent:build && loop:5 && until:done && return:step1 || step2 || step3} do the work"
    );
    expect(result.isInlineSubtask).toBe(true);
    expect(result.overrides.model).toBe("openai/gpt-4o");
    expect(result.overrides.agent).toBe("build");
    expect(result.overrides.loop).toEqual({ max: 5, until: "done" });
    expect(result.overrides.return).toEqual(["step1", "step2", "step3"]);
  });
});

describe("parseInlineSubtask", () => {
  it("parses valid inline subtask", () => {
    const result = parseInlineSubtask("{model:openai/gpt-4o} do the thing");
    expect(result).not.toBeNull();
    expect(result?.prompt).toBe("do the thing");
    expect(result?.overrides.model).toBe("openai/gpt-4o");
  });

  it("parses with agent override", () => {
    const result = parseInlineSubtask("{agent:build} implement feature");
    expect(result?.overrides.agent).toBe("build");
  });

  it("parses with loop config", () => {
    const result = parseInlineSubtask("{loop:5 && until:tests pass} fix tests");
    expect(result?.overrides.loop).toEqual({ max: 5, until: "tests pass" });
  });

  it("parses with return chain", () => {
    const result = parseInlineSubtask(
      "{return:validate || test || deploy} build"
    );
    expect(result?.overrides.return).toEqual(["validate", "test", "deploy"]);
  });

  it("parses with parallel commands", () => {
    const result = parseInlineSubtask("{parallel:/cmd1 || /cmd2} main task");
    expect(result?.overrides.parallel).toEqual(["/cmd1", "/cmd2"]);
  });

  it("returns null for non-brace input", () => {
    expect(parseInlineSubtask("no braces here")).toBeNull();
  });

  it("returns null for unclosed brace", () => {
    expect(parseInlineSubtask("{model:x no close")).toBeNull();
  });

  it("returns null for empty prompt", () => {
    expect(parseInlineSubtask("{model:x}")).toBeNull();
    expect(parseInlineSubtask("{model:x}   ")).toBeNull();
  });

  it("handles complex multi-param override", () => {
    const result = parseInlineSubtask(
      "{model:anthropic/claude-sonnet-4 && agent:build && loop:3 && until:complete} prompt"
    );
    expect(result?.overrides.model).toBe("anthropic/claude-sonnet-4");
    expect(result?.overrides.agent).toBe("build");
    expect(result?.overrides.loop).toEqual({ max: 3, until: "complete" });
  });

  it("handles whitespace in prompt", () => {
    const result = parseInlineSubtask(
      "{agent:build}   multiword prompt here  "
    );
    expect(result?.prompt).toBe("multiword prompt here");
  });
});
