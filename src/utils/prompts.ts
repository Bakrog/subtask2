/**
 * All prompts used by subtask2 plugin - centralized for easy editing
 */

/**
 * Default return prompt when no return is specified and replace_generic is true
 */
export const DEFAULT_RETURN_PROMPT =
  "Review, challenge and validate the task output against the codebase then continue with the next logical step.";

/**
 * Instruction for /subtask inline subtask - makes LLM say minimal response while subtask runs
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

> DO NOT WRITE OR EDIT ANY FILES - YOU ARE ONLY TO EVALUATE AND REPORT

After evaluation:
- If the condition IS satisfied: respond with <subtask2 loop=break/> to exit the loop
- If not, the loop will re-run after you yield back

You may now proceed with the evaluation.
</instructions>`;
}

/**
 * Unconditional loop yield prompt - tells main session to yield so loop can continue
 * Used when loop has no until condition (just {loop:N})
 */
export function loopYieldPrompt(iteration: number, max: number): string {
  return `<instructions subtask2=loop-yield>
A queued command iteration has completed (${iteration}/${max}).
Please yield back now to allow the next iteration to run.
</instructions>`;
}

/**
 * Auto workflow generation prompt - teaches LLM to generate subtask2 inline syntax
 */
export const AUTO_WORKFLOW_PROMPT = `You are tasked with creating a subtask2 command workflow to fulfill the user's request.

## Subtask2 Inline Syntax

Create a workflow using this inline syntax:
\`\`\`
/subtask{param && param && ...} prompt text
\`\`\`

### Available Parameters (separated by &&):

- \`model:provider/model-id\` - Override the model
- \`agent:agent-name\` - Override the agent (build, plan, explore)
- \`loop:N\` - Run exactly N times (unconditional)
- \`loop:N && until:condition\` - Run up to N times until condition met
- \`return:prompt1 || prompt2 || prompt3\` - Chain of prompts/commands to execute after
- \`parallel:/cmd1 args || /cmd2 args\` - Run multiple subtasks concurrently

### Examples:

- Simple: \`/subtask{agent:build} implement the auth system\`
- With returns: \`/subtask{return:validate the output || run the tests} build the feature\`
- With loop: \`/subtask{loop:5 && until:all tests pass} fix the failing tests\`
- Complex: \`/subtask{model:openai/gpt-4o && return:review || test || deploy} implement $FEATURE\`

### Rules:

1. Output your reasoning first
2. Then output the workflow inside: <subtask2 auto="true">...</subtask2>
3. The workflow must be a single /subtask{...} command with inline syntax
4. Do NOT create files - the workflow executes in memory
5. Use returns to chain multiple steps
6. Use parallel for concurrent independent tasks

USER INPUT:
`;
