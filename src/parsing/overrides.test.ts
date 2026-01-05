import { describe, it, expect } from "bun:test";
import { parseOverridesString } from "./overrides";
import { parseAutoWorkflowOutput } from "./auto";

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
});

describe("parseAutoWorkflowOutput", () => {
  it("parses <subtask2 auto=\"true\"> tag with /subtask command", () => {
    const text = `Some reasoning here...
<subtask2 auto="true">
/subtask{model:openai/gpt-4o && return:validate || test} implement the feature
</subtask2>`;
    const result = parseAutoWorkflowOutput(text);
    expect(result.found).toBe(true);
    expect(result.command).toBe(
      "/subtask{model:openai/gpt-4o && return:validate || test} implement the feature"
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
/subtask{agent:build} do something
</subtask2>`;
    const result = parseAutoWorkflowOutput(text);
    expect(result.found).toBe(true);
    expect(result.command).toBe("/subtask{agent:build} do something");
  });
});
