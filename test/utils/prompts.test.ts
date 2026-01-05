import { describe, it, expect } from "bun:test";
import {
  DEFAULT_RETURN_PROMPT,
  S2_INLINE_INSTRUCTION,
  loopEvaluationPrompt,
  loopYieldPrompt,
  AUTO_WORKFLOW_PROMPT,
} from "../../src/utils/prompts";

describe("DEFAULT_RETURN_PROMPT", () => {
  it("is a non-empty string", () => {
    expect(typeof DEFAULT_RETURN_PROMPT).toBe("string");
    expect(DEFAULT_RETURN_PROMPT.length).toBeGreaterThan(0);
  });

  it("contains key instruction words", () => {
    expect(DEFAULT_RETURN_PROMPT.toLowerCase()).toContain("review");
    expect(DEFAULT_RETURN_PROMPT.toLowerCase()).toContain("challenge");
  });
});

describe("S2_INLINE_INSTRUCTION", () => {
  it("contains system tag", () => {
    expect(S2_INLINE_INSTRUCTION).toContain("<system>");
    expect(S2_INLINE_INSTRUCTION).toContain("</system>");
  });

  it("instructs minimal response", () => {
    expect(S2_INLINE_INSTRUCTION.toLowerCase()).toContain("running");
  });
});

describe("loopEvaluationPrompt", () => {
  it("includes the condition", () => {
    const prompt = loopEvaluationPrompt("all tests pass", 3, 10);
    expect(prompt).toContain("all tests pass");
  });

  it("includes iteration count", () => {
    const prompt = loopEvaluationPrompt("done", 5, 10);
    expect(prompt).toContain("5/10");
  });

  it("includes instructions tag", () => {
    const prompt = loopEvaluationPrompt("x", 1, 5);
    expect(prompt).toContain("<instructions subtask2=loop-evaluation>");
    expect(prompt).toContain("</instructions>");
  });

  it("includes break signal syntax", () => {
    const prompt = loopEvaluationPrompt("x", 1, 1);
    expect(prompt).toContain("<subtask2 loop=break/>");
  });

  it("includes user-condition tags", () => {
    const prompt = loopEvaluationPrompt("my condition", 1, 5);
    expect(prompt).toContain("<user-condition>");
    expect(prompt).toContain("</user-condition>");
    expect(prompt).toContain("my condition");
  });

  it("instructs not to write files", () => {
    const prompt = loopEvaluationPrompt("x", 1, 1);
    expect(prompt.toLowerCase()).toContain("do not write");
  });
});

describe("loopYieldPrompt", () => {
  it("includes iteration count", () => {
    const prompt = loopYieldPrompt(3, 5);
    expect(prompt).toContain("3/5");
  });

  it("includes instructions tag", () => {
    const prompt = loopYieldPrompt(1, 3);
    expect(prompt).toContain("<instructions subtask2=loop-yield>");
    expect(prompt).toContain("</instructions>");
  });

  it("instructs to yield", () => {
    const prompt = loopYieldPrompt(1, 1);
    expect(prompt.toLowerCase()).toContain("yield");
  });
});

describe("AUTO_WORKFLOW_PROMPT", () => {
  it("is a non-empty string", () => {
    expect(typeof AUTO_WORKFLOW_PROMPT).toBe("string");
    expect(AUTO_WORKFLOW_PROMPT.length).toBeGreaterThan(0);
  });

  it("explains subtask2 syntax", () => {
    expect(AUTO_WORKFLOW_PROMPT).toContain("/subtask{");
    expect(AUTO_WORKFLOW_PROMPT).toContain("&&");
  });

  it("mentions available parameters", () => {
    expect(AUTO_WORKFLOW_PROMPT).toContain("model:");
    expect(AUTO_WORKFLOW_PROMPT).toContain("agent:");
    expect(AUTO_WORKFLOW_PROMPT).toContain("loop:");
    expect(AUTO_WORKFLOW_PROMPT).toContain("return:");
  });

  it("includes output format instructions", () => {
    expect(AUTO_WORKFLOW_PROMPT).toContain('<subtask2 auto="true">');
    expect(AUTO_WORKFLOW_PROMPT).toContain("</subtask2>");
  });

  it("ends with USER INPUT marker", () => {
    expect(AUTO_WORKFLOW_PROMPT.trim()).toMatch(/USER INPUT:?\s*$/);
  });
});
