import { describe, it, expect } from "bun:test";
import { parseFrontmatter, getTemplateBody } from "../../src/parsing/frontmatter";

describe("parseFrontmatter", () => {
  it("parses valid YAML frontmatter", () => {
    const content = `---
subtask: true
return: Look again
---
Review the PR`;
    const result = parseFrontmatter(content);
    expect(result.subtask).toBe(true);
    expect(result.return).toBe("Look again");
  });

  it("parses frontmatter with array values", () => {
    const content = `---
return:
  - First step
  - Second step
parallel:
  - /plan-gemini
  - /plan-opus
---
Plan the trip`;
    const result = parseFrontmatter(content);
    expect(result.return).toEqual(["First step", "Second step"]);
    expect(result.parallel).toEqual(["/plan-gemini", "/plan-opus"]);
  });

  it("parses frontmatter with object values", () => {
    const content = `---
loop:
  max: 10
  until: all tests pass
---
Run tests`;
    const result = parseFrontmatter(content);
    expect(result.loop).toEqual({ max: 10, until: "all tests pass" });
  });

  it("returns empty object when no frontmatter", () => {
    const content = "Just plain content";
    const result = parseFrontmatter(content);
    expect(result).toEqual({});
  });

  it("returns empty object for content without closing ---", () => {
    const content = `---
subtask: true
No closing delimiter`;
    const result = parseFrontmatter(content);
    expect(result).toEqual({});
  });

  it("returns empty object for invalid YAML", () => {
    const content = `---
invalid: [unclosed bracket
---
Content`;
    const result = parseFrontmatter(content);
    expect(result).toEqual({});
  });

  it("handles empty frontmatter", () => {
    const content = `---
---
Content only`;
    const result = parseFrontmatter(content);
    expect(result).toEqual({});
  });

  it("parses frontmatter with model and agent", () => {
    const content = `---
model: openai/gpt-4o
agent: build
description: Test command
---
Do the thing`;
    const result = parseFrontmatter(content);
    expect(result.model).toBe("openai/gpt-4o");
    expect(result.agent).toBe("build");
    expect(result.description).toBe("Test command");
  });

  it("parses subtask2: auto flag", () => {
    const content = `---
subtask2: auto
---
$ARGUMENTS`;
    const result = parseFrontmatter(content);
    expect(result.subtask2).toBe("auto");
  });
});

describe("getTemplateBody", () => {
  it("extracts body after frontmatter", () => {
    const content = `---
subtask: true
---
This is the body`;
    const result = getTemplateBody(content);
    expect(result).toBe("This is the body");
  });

  it("returns full content when no frontmatter", () => {
    const content = "Just plain content";
    const result = getTemplateBody(content);
    expect(result).toBe("Just plain content");
  });

  it("handles multiline body", () => {
    const content = `---
return: done
---
Line 1
Line 2
Line 3`;
    const result = getTemplateBody(content);
    expect(result).toBe("Line 1\nLine 2\nLine 3");
  });

  it("trims whitespace from body", () => {
    const content = `---
subtask: true
---

  Padded content  

`;
    const result = getTemplateBody(content);
    expect(result).toBe("Padded content");
  });

  it("handles body with $ARGUMENTS placeholder", () => {
    const content = `---
description: plan
---
Plan the feature: $ARGUMENTS`;
    const result = getTemplateBody(content);
    expect(result).toBe("Plan the feature: $ARGUMENTS");
  });

  it("handles body with $TURN references", () => {
    const content = `---
subtask: true
---
Review conversation:
$TURN[10]`;
    const result = getTemplateBody(content);
    expect(result).toBe("Review conversation:\n$TURN[10]");
  });
});
