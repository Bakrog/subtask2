import { describe, it, expect } from "bun:test";
import { parseOverridesString } from "../../src/parsing/overrides";
import { parseAutoWorkflowOutput } from "../../src/parsing/auto";

describe("parseOverridesString", () => {
  it("parses model && agent correctly", () => {
    const result = parseOverridesString("model:openai/gpt-4o && agent:build");
    expect(result.model).toBe("openai/gpt-4o");
    expect(result.agent).toBe("build");
  });

  it("parses return with || creating array of 3 returns", () => {
    const result = parseOverridesString("return:first || second || third");
    expect(result.return).toEqual(["first", "second", "third"]);
  });

  it("parses parallel with || creating array of 2 commands", () => {
    const result = parseOverridesString("parallel:/cmd1 args || /cmd2 args");
    expect(result.parallel).toEqual(["/cmd1 args", "/cmd2 args"]);
  });

  it("parses unconditional loop:5", () => {
    const result = parseOverridesString("loop:5");
    expect(result.loop).toEqual({ max: 5, until: "" });
  });

  it("parses conditional loop:5 && until:done", () => {
    const result = parseOverridesString("loop:5 && until:tests pass");
    expect(result.loop).toEqual({ max: 5, until: "tests pass" });
  });

  it("parses retry as legacy loop alias", () => {
    const result = parseOverridesString("retry:4 && until:ready");
    expect(result.loop).toEqual({ max: 4, until: "ready" });
  });

  it("parses complex inline with all parameters", () => {
    const result = parseOverridesString(
      "model:anthropic/claude-sonnet-4 && agent:build && loop:5 && until:all done && return:validate || test"
    );
    expect(result.model).toBe("anthropic/claude-sonnet-4");
    expect(result.agent).toBe("build");
    expect(result.loop).toEqual({ max: 5, until: "all done" });
    expect(result.return).toEqual(["validate", "test"]);
  });

  it("handles spaces around && separators", () => {
    const result = parseOverridesString("model:x  &&  agent:y");
    expect(result.model).toBe("x");
    expect(result.agent).toBe("y");
  });

  it("returns empty object for empty string", () => {
    const result = parseOverridesString("");
    expect(result).toEqual({});
  });

  it("handles only until without loop", () => {
    const result = parseOverridesString("until:tests pass");
    expect(result.loop).toEqual({ max: 10, until: "tests pass" });
  });

  it("handles parallel with single command", () => {
    const result = parseOverridesString("parallel:/cmd1");
    expect(result.parallel).toEqual(["/cmd1"]);
  });

  it("filters empty values in return array", () => {
    const result = parseOverridesString("return:first ||  || third");
    expect(result.return).toEqual(["first", "third"]);
  });

  it("filters empty values in parallel array", () => {
    const result = parseOverridesString("parallel:/cmd1 ||  || /cmd3");
    expect(result.parallel).toEqual(["/cmd1", "/cmd3"]);
  });

  it("ignores invalid loop value", () => {
    const result = parseOverridesString("loop:abc");
    expect(result.loop).toBeUndefined();
  });

  it("ignores zero loop value", () => {
    const result = parseOverridesString("loop:0");
    expect(result.loop).toBeUndefined();
  });

  it("ignores negative loop value", () => {
    const result = parseOverridesString("loop:-5");
    expect(result.loop).toBeUndefined();
  });

  it("handles model with complex provider/model path", () => {
    const result = parseOverridesString("model:github-copilot/claude-opus-4.5");
    expect(result.model).toBe("github-copilot/claude-opus-4.5");
  });

  it("handles agent with hyphen", () => {
    const result = parseOverridesString("agent:my-agent");
    expect(result.agent).toBe("my-agent");
  });

  it("handles pairs without colon gracefully", () => {
    const result = parseOverridesString("model:x && invalid && agent:y");
    expect(result.model).toBe("x");
    expect(result.agent).toBe("y");
  });

  it("handles multiple colons in value", () => {
    const result = parseOverridesString("until:condition: with: colons");
    expect(result.loop?.until).toBe("condition: with: colons");
  });

  it("parses as: for named result capture", () => {
    const result = parseOverridesString("as:my-result");
    expect(result.as).toBe("my-result");
  });

  it("parses as: combined with model and agent", () => {
    const result = parseOverridesString(
      "model:openai/gpt-4o && agent:build && as:gpt-plan"
    );
    expect(result.model).toBe("openai/gpt-4o");
    expect(result.agent).toBe("build");
    expect(result.as).toBe("gpt-plan");
  });

  it("parses as: with loop and return", () => {
    const result = parseOverridesString(
      "loop:5 && until:done && as:loop-result && return:validate"
    );
    expect(result.loop).toEqual({ max: 5, until: "done" });
    expect(result.as).toBe("loop-result");
    expect(result.return).toEqual(["validate"]);
  });

  it("parses auto:true for auto workflow mode", () => {
    const result = parseOverridesString("auto:true");
    expect(result.auto).toBe(true);
  });

  it("parses auto:true combined with other overrides", () => {
    const result = parseOverridesString(
      "auto:true && model:openai/gpt-4o && agent:build"
    );
    expect(result.auto).toBe(true);
    expect(result.model).toBe("openai/gpt-4o");
    expect(result.agent).toBe("build");
  });

  it("auto:false is not truthy", () => {
    const result = parseOverridesString("auto:false");
    expect(result.auto).toBe(false);
  });
});

describe("parseAutoWorkflowOutput", () => {
  it('parses <subtask2 auto="true"> tag with /subtask command', () => {
    const text = `Some reasoning here...
 <subtask2 auto="true">
 /subtask {model:openai/gpt-4o && return:validate || test} implement the feature
</subtask2>`;
    const result = parseAutoWorkflowOutput(text);
    expect(result.found).toBe(true);
    expect(result.command).toBe(
      "/subtask {model:openai/gpt-4o && return:validate || test} implement the feature"
    );
  });

  it("returns found:false when no tag present", () => {
    const result = parseAutoWorkflowOutput("just some text without tags");
    expect(result.found).toBe(false);
  });

  it("returns found:false when content doesn't start with /subtask", () => {
    const text = `<subtask2 auto="true">
some other command
</subtask2>`;
    const result = parseAutoWorkflowOutput(text);
    expect(result.found).toBe(false);
  });

  it("handles single quotes in attribute", () => {
    const text = `<subtask2 auto='true'>
 /subtask {agent:build} do something
</subtask2>`;
    const result = parseAutoWorkflowOutput(text);
    expect(result.found).toBe(true);
    expect(result.command).toBe("/subtask {agent:build} do something");
  });
});
