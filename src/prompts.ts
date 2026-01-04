/**
 * All prompts used by subtask2 plugin - centralized for easy editing
 */

/**
 * Default return prompt when no return is specified and replace_generic is true
 */
export const DEFAULT_RETURN_PROMPT =
  "Review, challenge and validate the task output against the codebase then continue with the next logical step.";

/**
 * Instruction for /s2 inline subtask - makes LLM say minimal response while subtask runs
 */
export const S2_INLINE_INSTRUCTION = `<system>Say this phrase EXACTLY and nothing else: "Running subagent..."</system>`;

/**
 * Loop evaluation prompt - injected after subtask completes for orchestrator to decide
 */
export function loopEvaluationPrompt(
  condition: string,
  iteration: number,
  max: number
): string {
  return `<instructions subtask2=loop-evaluation>
The user chose to loop the subtask that was just executed.
Current loop progress: ${iteration}/${max} iterations.

**You are now tasked with evaluating the previous work done in context of this conversation and verify if the current codebase state satisfies the user conditions.**

<user-condition>
${condition}
</user-condition>

You may read files, check git diff/status, run tests, or do whatever verification is needed.

After evaluation, respond with ONE of:
- <subtask2 loop=break/> - loop condition satisfied, proceed to next step
- <subtask2 loop=continue/> - more work needed, loop again

You may now proceed with the evaluation.
</instructions>`;
}
