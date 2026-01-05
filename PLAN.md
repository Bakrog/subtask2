Subtask2 Implementation Plan: Inline Syntax Enhancement + Return Stacking + Auto Workflow
Overview
This plan implements three major features:

1. New inline syntax: Switch from || to && for parameter separation, add return: and parallel: support
2. Return stacking: Nested returns execute in order before parent chain continues
3. subtask2: auto: LLM generates and executes workflows dynamically

---

Phase 1: Switch Inline Parameter Separator from || to &&
Background
Currently inline overrides use || to separate parameters: {model:x||loop:5||until:condition}
We need to switch to && so that || can be used for multi-value parameters (returns, parallels).
Step 1.1: Update src/parsing/overrides.ts
File: src/parsing/overrides.ts
Current code (line 10-11):
/\*\*

- Parse overrides string like "model:foo/bar||loop:10||until:condition"
- Uses || as separator to allow commas in until conditions
  \*/
  Change to:
  /\*\*
- Parse overrides string like "model:foo/bar && loop:10 && until:condition"
- Uses && as separator between parameters
- Uses || as separator for multi-value parameters (return, parallel)
  \*/
  Current code (line 17):
  const pairs = overridesStr.split("||");
  Change to:
  const pairs = overridesStr.split("&&").map(s => s.trim());
  Why: The .map(s => s.trim()) allows users to write {model:x && loop:5} with spaces for readability.

---

Phase 2: Add return: to Inline Syntax
Background
We want to support: {return:first return || second return || third return && model:x}
Step 2.1: Update CommandOverrides interface
File: src/parsing/overrides.ts
Current code (lines 3-7):
export interface CommandOverrides {
model?: string;
agent?: string;
loop?: LoopConfig;
}
Change to:
export interface CommandOverrides {
model?: string;
agent?: string;
loop?: LoopConfig;
return?: string[];
}
Step 2.2: Parse return: in parseOverridesString
File: src/parsing/overrides.ts
After the until handling block (after line 39), add:
} else if (key === "return") {
// return:first || second || third - split on || for multiple returns
overrides.return = value.split("||").map(s => s.trim()).filter(s => s.length > 0);
}
Full updated function will look like:
export function parseOverridesString(overridesStr: string): CommandOverrides {
const overrides: CommandOverrides = {};
// Parse key:value pairs separated by &&
const pairs = overridesStr.split("&&").map(s => s.trim());
for (const pair of pairs) {
const colonIdx = pair.indexOf(":");
if (colonIdx > 0) {
const key = pair.slice(0, colonIdx).trim();
const value = pair.slice(colonIdx + 1).trim();
if (key === "model") {
overrides.model = value;
} else if (key === "agent") {
overrides.agent = value;
} else if (key === "loop") {
const max = parseInt(value, 10);
if (!isNaN(max) && max > 0) {
overrides.loop = { max, until: "" };
}
} else if (key === "until") {
if (!overrides.loop) {
overrides.loop = { max: 10, until: value };
} else {
overrides.loop.until = value;
}
} else if (key === "return") {
// return:first || second || third - split on || for multiple returns
overrides.return = value.split("||").map(s => s.trim()).filter(s => s.length > 0);
}
}
}
return overrides;
}

---

Phase 3: Add parallel: to Inline Syntax
Step 3.1: Update CommandOverrides interface
File: src/parsing/overrides.ts
Change the interface to:
export interface CommandOverrides {
model?: string;
agent?: string;
loop?: LoopConfig;
return?: string[];
parallel?: string[];
}
Step 3.2: Parse parallel: in parseOverridesString
File: src/parsing/overrides.ts
Add after the return handling block:
} else if (key === "parallel") {
// parallel:/cmd1 args || /cmd2 args - split on || for multiple parallels
overrides.parallel = value.split("||").map(s => s.trim()).filter(s => s.length > 0);
}

---

Phase 4: Implement Return Stacking
Background
Problem: When a return chain contains /subtask{return:a || b}, those inner returns (a, b) must execute BEFORE the parent chain continues.
Current state: returnState is a flat Map<string, string[]> - one array per session.
Solution: Change to a stack of return chains: Map<string, string[][]> - when inner subtask has returns, push them onto the stack. Process top of stack first, pop when empty.
Step 4.1: Add return stack to state
File: src/core/state.ts
Add new state variable after line 20:
const returnState = new Map<string, string[]>();
const returnStack = new Map<string, string[][]>(); // NEW: Stack of return chains
Add new functions after the Return State section (after line 107):
// ============================================================================
// Return Stack (for nested returns)
// ============================================================================
/\*\*

- Push a new return chain onto the stack.
- Used when an inline subtask has its own returns.
  \*/
  export function pushReturnStack(sessionID: string, returns: string[]): void {
  if (!returnStack.has(sessionID)) {
  returnStack.set(sessionID, []);
  }
  returnStack.get(sessionID)!.push(returns);
  }
  /\*\*
- Get the current (top) return chain from the stack.
- Returns undefined if stack is empty.
  \*/
  export function peekReturnStack(sessionID: string): string[] | undefined {
  const stack = returnStack.get(sessionID);
  if (!stack || stack.length === 0) return undefined;
  return stack[stack.length - 1];
  }
  /\*\*
- Pop the current return chain from the stack (when it's exhausted).
  \*/
  export function popReturnStack(sessionID: string): void {
  const stack = returnStack.get(sessionID);
  if (stack && stack.length > 0) {
  stack.pop();
  if (stack.length === 0) {
  returnStack.delete(sessionID);
  }
  }
  }
  /\*\*
- Check if there are any return chains on the stack.
  \*/
  export function hasReturnStack(sessionID: string): boolean {
  const stack = returnStack.get(sessionID);
  return stack !== undefined && stack.length > 0;
  }
  /\*\*
- Shift the next return item from the current chain.
- If chain becomes empty, pops it from the stack.
- Returns undefined if no returns left.
  \*/
  export function shiftReturnStack(sessionID: string): string | undefined {
  const stack = returnStack.get(sessionID);
  if (!stack || stack.length === 0) return undefined;

const currentChain = stack[stack.length - 1];
if (!currentChain || currentChain.length === 0) {
stack.pop();
if (stack.length === 0) {
returnStack.delete(sessionID);
}
return undefined;
}

const next = currentChain.shift();

// If chain is now empty, pop it
if (currentChain.length === 0) {
stack.pop();
if (stack.length === 0) {
returnStack.delete(sessionID);
}
}

return next;
}
/\*\*

- Clear all return stacks for a session.
  \*/
  export function clearReturnStack(sessionID: string): void {
  returnStack.delete(sessionID);
  }
  Update exports at the end of file to include new functions.
  Step 4.2: Push inline subtask returns onto stack
  File: src/features/returns.ts
  Find the inline subtask handling section (around line 42-99).
  After line 65 (after the loop start), add:
  // If inline subtask has its own returns, push them onto the stack
  // They will execute after this subtask completes, before parent chain continues
  if (parsed.overrides.return && parsed.overrides.return.length > 0) {
  // Import at top: import { pushReturnStack } from "../core/state";
  pushReturnStack(sessionID, [...parsed.overrides.return]);
  log(`executeReturn: pushed ${parsed.overrides.return.length} inline returns onto stack`);
  }
  Add the import at the top of the file (line 2-13 area):
  import {
  // ... existing imports ...
  pushReturnStack,
  } from "../core/state";
  Step 4.3: Update completion-hooks to use stack
  File: src/hooks/completion-hooks.ts
  Add imports at top:
  import {
  getClient,
  getReturnState,
  deleteReturnState,
  getPendingNonSubtaskReturns,
  deletePendingNonSubtaskReturns,
  hasLastReturnWasCommand,
  deleteExecutedReturn,
  // NEW imports:
  hasReturnStack,
  shiftReturnStack,
  } from "../core/state";
  Update the return processing section (around lines 118-130).
  Current code:
  // Handle remaining returns
  const remaining = getReturnState(input.sessionID);
  if (!remaining?.length || !client) return;
  // If a command/inline subtask is running, don't advance - tool.after will handle it
  if (hasLastReturnWasCommand(input.sessionID)) {
  log(`text.complete: waiting for command/inline subtask to complete`);
  return;
  }
  const next = remaining.shift()!;
  if (!remaining.length) deleteReturnState(input.sessionID);
  executeReturn(next, input.sessionID).catch(console.error);
  Change to:
  // If a command/inline subtask is running, don't advance - tool.after will handle it
  if (hasLastReturnWasCommand(input.sessionID)) {
  log(`text.complete: waiting for command/inline subtask to complete`);
  return;
  }
  // PRIORITY 1: Process stacked returns first (from nested inline subtasks)
  if (hasReturnStack(input.sessionID)) {
  const next = shiftReturnStack(input.sessionID);
  if (next) {
  log(`text.complete: executing stacked return: "${next.substring(0, 40)}..."`);
  executeReturn(next, input.sessionID).catch(console.error);
  return;
  }
  }
  // PRIORITY 2: Process original return chain
  const remaining = getReturnState(input.sessionID);
  if (!remaining?.length || !client) return;
  const next = remaining.shift()!;
  if (!remaining.length) deleteReturnState(input.sessionID);
  log(`text.complete: executing return: "${next.substring(0, 40)}..."`);
  executeReturn(next, input.sessionID).catch(console.error);
  Step 4.4: Handle loop + return conflict
  File: src/features/returns.ts
  In the inline subtask section, BEFORE pushing returns onto stack, add a check:
  // If inline subtask has loop AND returns, log warning - returns are ignored during loop
  // (loop needs the return slot for evaluation)
  if (parsed.overrides.loop && parsed.overrides.return?.length) {
  log(`executeReturn: WARNING - inline subtask has both loop and return, returns will be ignored`);
  } else if (parsed.overrides.return && parsed.overrides.return.length > 0) {
  // No loop, safe to push returns
  pushReturnStack(sessionID, [...parsed.overrides.return]);
  log(`executeReturn: pushed ${parsed.overrides.return.length} inline returns onto stack`);
  }

---

Phase 5: Implement subtask2: auto
Step 5.1: Add auto to types
File: src/types.ts
Find CommandConfig interface and add:
export interface CommandConfig {
return: string[];
parallel: ParallelCommand[];
agent?: string;
description?: string;
template?: string;
loop?: LoopConfig;
auto?: boolean; // NEW: subtask2: auto mode
}
Step 5.2: Parse subtask2: auto in manifest
File: src/commands/manifest.ts
Find where frontmatter is parsed and add:
// After parsing other frontmatter fields...
if (frontmatter.subtask2 === "auto") {
config.auto = true;
}
Step 5.3: Create auto workflow prompt
File: src/utils/prompts.ts
Add at the end of the file:
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
   Step 5.4: Create auto parsing module
   File: src/parsing/auto.ts (NEW FILE)
   /\*\*

- Parse auto workflow output from LLM response
  \*/
  export interface AutoWorkflowResult {
  found: boolean;
  command?: string; // The full /subtask{...} command
  }
  /\*\*
- Extract the workflow command from <subtask2 auto="true">...</subtask2> tags
  _/
  export function parseAutoWorkflowOutput(text: string): AutoWorkflowResult {
  const regex = /<subtask2\s+auto\s_=\s*["']?true["']?\s*>([\s\S]\*?)<\/subtask2>/i;
  const match = text.match(regex);

if (!match || !match[1]) {
return { found: false };
}

const content = match[1].trim();

// Validate it starts with /subtask
if (!content.toLowerCase().startsWith("/subtask")) {
return { found: false };
}

return {
found: true,
command: content,
};
}
Update src/parsing/index.ts to export:
export \* from "./auto";
Step 5.5: Create auto execution feature
File: src/features/auto.ts (NEW FILE)
import { readFileSync } from "fs";
import { join } from "path";
import { getClient, registerPendingParentForPrompt, setReturnState } from "../core/state";
import { log } from "../utils/logger";
import { AUTO_WORKFLOW_PROMPT } from "../utils/prompts";
/\*\*

- Execute a subtask2: auto workflow
-
- 1.  Loads README.md for syntax reference
- 2.  Spawns subtask with auto prompt + user arguments
- 3.  Sets up return to parse and execute the generated workflow
      \*/
      export async function executeAutoWorkflow(
      userArguments: string,
      sessionID: string,
      agent?: string,
      model?: { providerID: string; modelID: string }
      ): Promise<void> {
      const client = getClient();

// Build the prompt
const prompt = AUTO_WORKFLOW_PROMPT + userArguments;

log(`executeAutoWorkflow: starting auto workflow with args="${userArguments.substring(0, 50)}..."`);

// Register parent session for later reference
registerPendingParentForPrompt(prompt, sessionID);

// Set up the return to parse and execute the workflow
// This special marker tells message-hooks to parse the auto output
setReturnState(sessionID, ["__subtask2_auto_parse__"]);

try {
await client.session.promptAsync({
path: { id: sessionID },
body: {
parts: [
{
type: "subtask",
agent: agent || "build",
model,
description: "Auto workflow generation",
prompt,
},
],
},
});
} catch (e) {
log(`executeAutoWorkflow FAILED:`, e);
}
}
Update src/features/index.ts to export:
export \* from "./auto";
Step 5.6: Handle auto commands in command-hooks
File: src/hooks/command-hooks.ts
Add import at top:
import { executeAutoWorkflow } from "../features/auto";
At the START of commandExecuteBefore function, add detection for auto mode:
export async function commandExecuteBefore(input: any, output: any) {
const sessionID = input.sessionID;
const commandName = input.command;

// Get config for this command
const configs = getConfigs();
const config = getConfig(configs, commandName);

// CHECK FOR AUTO MODE FIRST
if (config?.auto) {
log(`command.execute.before: detected subtask2:auto for ${commandName}`);

    // Build model if specified in frontmatter
    let model: { providerID: string; modelID: string } | undefined;
    if (config.model?.includes("/")) {
      const [providerID, ...rest] = config.model.split("/");
      model = { providerID, modelID: rest.join("/") };
    }

    // Execute auto workflow - ignores return/parallel/$TURN from frontmatter
    await executeAutoWorkflow(
      input.arguments || "",
      sessionID,
      config.agent,
      model
    );

    // Prevent normal command execution
    return { ...output, abort: true };

}

// ... rest of existing function ...
}
Step 5.7: Handle auto workflow parsing in returns
File: src/features/returns.ts
Add import at top:
import { parseAutoWorkflowOutput } from "../parsing/auto";
At the START of executeReturn function, add special handling for auto parse marker:
export async function executeReturn(
item: string,
sessionID: string,
loopOverride?: LoopConfig
) {
// SPECIAL: Auto workflow parse marker
if (item === "**subtask2_auto_parse**") {
const client = getClient();

    // Get the last assistant message (the auto workflow output)
    const messages = await client.session.messages({
      path: { id: sessionID },
    });
    const lastMsg = messages.data?.[messages.data.length - 1];
    const lastText = lastMsg?.parts?.find((p: any) => p.type === "text")?.text || "";

    // Parse the auto workflow output
    const result = parseAutoWorkflowOutput(lastText);

    if (!result.found || !result.command) {
      log(`executeReturn: auto workflow parse failed - no valid <subtask2 auto> tag found`);
      return;
    }

    log(`executeReturn: parsed auto workflow: "${result.command.substring(0, 80)}..."`);

    // Execute the parsed command as if user invoked it
    // This recurses into executeReturn with the actual /subtask{...} command
    await executeReturn(result.command, sessionID);
    return;

}

// Dedup check to prevent double execution
const key = `${sessionID}:${item}`;
// ... rest of existing function ...
}

---

Phase 6: Update README
File: README.md
Update all inline syntax examples from , and || parameter separator to &&.
Key sections to update:

1. Section 2 (model override):
   - Change: {model:provider/id||agent:name}
   - To: {model:provider/id && agent:name}
2. Section 2c (inline subtasks):
   - Change: {loop:10,until:tests pass} and {model:openai/gpt-4o,agent:build}
   - To: {loop:10 && until:tests pass} and {model:openai/gpt-4o && agent:build}
   - Add return: examples: {return:validate || test || deploy && model:x}
3. Section 3 (loop):
   - Change: {loop:10,until:condition}
   - To: {loop:10 && until:condition}
   - Document unconditional {loop:5} vs conditional {loop:5 && until:X}
4. Add new section for inline returns:
   Inline Returns

   Chain returns directly in inline subtasks:

   /subtask{return:validate the output || run tests || deploy} implement the feature

   Returns execute in order after the subtask completes.

5. Add section for subtask2: auto: 7. `subtask2: auto` - Dynamic Workflow Generation

   Let the LLM create and execute workflows dynamically:

   ***

   agent: build
   model: openai/gpt-4o
   subtask2: auto

   ***

   $ARGUMENTS

   Usage: /auto-workflow build a multi-model planning system with validation

   The LLM will:

   1. Analyze your request
   2. Generate an appropriate workflow using inline syntax
   3. Execute that workflow automatically

   Note: return, parallel, and $TURN are ignored in auto commands.

---

Testing Checklist
After implementation, verify:

- [ ] {model:x && agent:y} parses correctly
- [ ] {return:a || b || c} creates array of 3 returns
- [ ] {parallel:/cmd1 || /cmd2} creates array of 2 parallels
- [ ] Inline subtask with returns executes returns after completion
- [ ] Nested returns execute before parent chain continues
- [ ] {loop:5} runs exactly 5 times without evaluation
- [ ] {loop:5 && until:done} evaluates condition each iteration
- [ ] subtask2: auto spawns workflow generation subtask
- [ ] Auto workflow parses <subtask2 auto="true"> and executes content
- [ ] Auto commands ignore frontmatter return/parallel/$TURN

---

File Summary
| File | Action | Description |
|------|--------|-------------|
| src/parsing/overrides.ts | MODIFY | && split, add return[], parallel[] |
| src/core/state.ts | MODIFY | Add return stack functions |
| src/features/returns.ts | MODIFY | Push inline returns, handle auto parse |
| src/hooks/completion-hooks.ts | MODIFY | Process return stack first |
| src/types.ts | MODIFY | Add auto?: boolean |
| src/commands/manifest.ts | MODIFY | Parse subtask2: auto |
| src/parsing/auto.ts | CREATE | Parse auto workflow XML |
| src/features/auto.ts | CREATE | Execute auto workflow |
| src/hooks/command-hooks.ts | MODIFY | Detect and route auto commands |
| src/utils/prompts.ts | MODIFY | Add AUTO_WORKFLOW_PROMPT |
| README.md | MODIFY | Document new syntax |

---
