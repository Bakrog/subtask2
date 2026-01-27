# Subtask2 Test Plan

Focus: **Real features claimed in README** - not internal logic that's obviously right or wrong.

---

## FEATURES TO TEST

### 1. `return` - Chaining prompts after command completion

**What it does:** After a command/subtask completes, inject follow-up prompts into the main session.

- [ ] **1.1** Single `return` string in frontmatter → First return replaces opencode's "summarize" message
- [ ] **1.2** Array of `return` prompts → Each fires sequentially after LLM turn completes
- [ ] **1.3** `/command` in return (not first position) → Command is executed with its own return/parallel
- [ ] **1.4** `/command args` in return → Arguments passed correctly to the triggered command
- [ ] **1.5** Mixed prompts and `/commands` in return array → Correct execution order: prompt → command → prompt
- [ ] **1.6** No `return` + `replace_generic: true` → Default fallback prompt is used
- [ ] **1.7** No `return` + `replace_generic: false` → Opencode's original "summarize" message preserved
- [ ] **1.8** Custom `generic_return` in config → Config prompt used as fallback
- [ ] **1.9** Return on non-subtask command → Fires as follow-up (not replacement)

---

### 2. Inline overrides `{model:...}`, `{agent:...}`

**What it does:** Override model/agent for any command invocation inline.

- [ ] **2.1** `/cmd {model:provider/name} args` → Model override parsed and applied to subtask
- [ ] **2.2** `/cmd {agent:agentname} args` → Agent override parsed and applied
- [ ] **2.3** Combined `{model:x && agent:y}` → Both overrides applied
- [ ] **2.4** Override in return chain `/cmd {model:x}` → Override applied to chained command
- [ ] **2.5** Override priority: inline vs frontmatter → Inline wins over frontmatter

---

### 3. `/subtask {...} prompt` - Inline subtasks

**What it does:** Create ad-hoc subtasks without command files.

- [ ] **3.1** `/subtask prompt` (no overrides) → Simple subtask spawned
- [ ] **3.2** `/subtask {model:x} prompt` → Model override applied
- [ ] **3.3** `/subtask {agent:x} prompt` → Agent override applied
- [ ] **3.4** `/subtask {model:x && agent:y} prompt` → Combined overrides work
- [ ] **3.5** `/subtask {loop:5} prompt` → Loop runs 5 times
- [ ] **3.6** `/subtask {loop:5 && until:condition} prompt` → Conditional loop with evaluation
- [ ] **3.7** `/subtask {return:a || b || c} prompt` → Inline returns parsed and execute in order
- [ ] **3.8** `/subtask {as:name} prompt` → Result captured with name
- [ ] **3.9** `/subtask {parallel:...} prompt` → Parallel commands spawned
- [ ] **3.10** All overrides combined in one inline subtask → Everything works together
- [ ] **3.11** Inline subtask in return chain → Spawns correctly from return
- [ ] **3.12** Nested inline subtasks in parallel → `/subtask {parallel: /subtask {...} || /subtask {...}}`

---

### 4. `loop` - Repeat until condition met

**What it does:** Run command repeatedly (fixed N or until condition satisfied).

- [ ] **4.1** `loop: 5` frontmatter (no until) → Runs exactly 5 times, no evaluation
- [ ] **4.2** `loop: {max: 10, until: "..."}` frontmatter → Conditional loop with evaluation prompt
- [ ] **4.3** `{loop:5}` inline override → Same as frontmatter
- [ ] **4.4** `{loop:5 && until:condition}` inline → Conditional loop
- [ ] **4.5** LLM responds `<subtask2 loop="break"/>` → Loop terminates, proceeds to next return
- [ ] **4.6** LLM responds `<subtask2 loop="continue"/>` → Loop continues with next iteration
- [ ] **4.7** Max iterations reached → Loop terminates as safety net
- [ ] **4.8** Loop + return interaction → Returns ignored while looping, fire after loop ends
- [ ] **4.9** Inline loop override priority over frontmatter → Inline wins

---

### 5. `parallel` - Run subtasks concurrently

**What it does:** Spawn multiple subtasks alongside main command.

- [ ] **5.1** `parallel: [/cmd1, /cmd2]` frontmatter → All 3 run (main + 2 parallel)
- [ ] **5.2** `parallel: /cmd1, /cmd2` string syntax → Comma-separated parsed correctly
- [ ] **5.3** `parallel: [{command: x, arguments: y}]` → Object syntax with custom args
- [ ] **5.4** `/cmd {parallel:/a || /b}` inline override → Parallel parsed from inline
- [ ] **5.5** Piped args `||` to parallel commands → `/cmd main || arg1 || arg2` maps correctly
- [ ] **5.6** Parallel commands inherit main $ARGUMENTS → When no custom args specified
- [ ] **5.7** Parallel commands forced to subtask → Regardless of their own `subtask:` setting
- [ ] **5.8** Parallel commands' own `return` ignored → Only parent's return applies
- [ ] **5.9** Nested parallels flattened → Max depth 5, no infinite recursion
- [ ] **5.10** All parallels complete before return fires → Wait for all

---

### 6. `{as:name}` and `$RESULT[name]` - Named results

**What it does:** Capture subtask output, reference later in return chains.

- [ ] **6.1** `{as:name}` on command, `$RESULT[name]` in return → Value substituted correctly
- [ ] **6.2** Multiple named results in one workflow → All captured and accessible
- [ ] **6.3** `$RESULT[name]` for non-existent name → `[Result 'name' not found]` placeholder
- [ ] **6.4** Named result from parallel command → Captured correctly
- [ ] **6.5** Named result from inline subtask → Captured correctly
- [ ] **6.6** Named result from return chain command → Captured and available for later returns
- [ ] **6.7** Result capture across session scopes → Parent session receives child's named result

---

### 7. `$TURN[n]` - Reference conversation history

**What it does:** Inject previous conversation turns into command prompt.

- [ ] **7.1** `$TURN[5]` - last 5 messages → Correct messages fetched and formatted
- [ ] **7.2** `$TURN[:3]` - specific index → Just the 3rd-from-end message
- [ ] **7.3** `$TURN[:2:5:8]` - multiple indices → Messages at indices 2, 5, 8
- [ ] **7.4** `$TURN[*]` - all messages → Full session history
- [ ] **7.5** `$TURN` in command body → Replaced before execution
- [ ] **7.6** `$TURN` in arguments → Replaced in args
- [ ] **7.7** `$TURN` in parallel prompts → Replaced correctly
- [ ] **7.8** `$TURN` in piped args → Replaced correctly
- [ ] **7.9** Empty/short session (fewer messages than requested) → Graceful handling
- [ ] **7.10** Format output `--- USER ---` / `--- ASSISTANT ---` → Correct format

---

### 8. Piped arguments `||`

**What it does:** Pass different arguments to main, parallels, and return commands.

- [ ] **8.1** `/cmd main || parallel1 || parallel2` → Args mapped: main → parallel1 → parallel2
- [ ] **8.2** More pipes than targets → Extra pipes handled gracefully
- [ ] **8.3** Fewer pipes than targets → Remaining targets inherit main args
- [ ] **8.4** Pipes to return commands → Return /commands receive piped args
- [ ] **8.5** Priority: pipe > frontmatter args > inherit → Correct precedence

---

### 9. `subtask2: auto` - Dynamic workflow generation (experimental)

**What it does:** LLM generates and executes workflow dynamically.

- [ ] **9.1** Basic auto workflow → Prompt built, subtask spawned, output parsed
- [ ] **9.2** `<subtask2 auto>...</subtask2>` tag extraction → Workflow extracted and executed
- [ ] **9.3** `return`, `parallel`, `$TURN` ignored → Only LLM-generated workflow matters

---

### 10. Configuration (`subtask2.jsonc`)

- [ ] **10.1** `replace_generic: true` → Default return used when no `return` specified
- [ ] **10.2** `replace_generic: false` → Opencode original message preserved
- [ ] **10.3** Custom `generic_return` → Custom default used
- [ ] **10.4** Config file missing → Sensible defaults applied

---

## INTEGRATION SCENARIOS

These test multiple features working together:

- [ ] **I.1** Multi-model A/B comparison → parallel + as + $RESULT + return
- [ ] **I.2** Fix-until-pass loop → loop + until + return chain
- [ ] **I.3** Complex inline subtask → /subtask + all overrides + nested parallel
- [ ] **I.4** Context-aware command → $TURN + return chain
- [ ] **I.5** Full orchestration workflow → Everything: parallel + loop + as + $RESULT + $TURN + return chain

---

## CODE CLEANUP (Not Tests)

Remove unnecessary backwards compat that makes no sense for a self-contained plugin:

- [ ] `src/parsing/turns.ts:74-78` → Remove `extractSessionReferences`, `hasSessionReferences`, `replaceSessionReferences`, `SessionReference` aliases
- [ ] `src/utils/config.ts:6-7` → Remove `DEFAULT_PROMPT` re-export - just update the 2 files that use it
- [ ] `src/core/state.ts:25` → Remove `returnArgsState` alias - just use `pipedArgsQueue`

---

## TEST EXECUTION

- [ ] **Unit tests** - Already exist for parsing logic (internal)
- [ ] **Feature tests** - Mock opencode hooks, verify behavior (this plan)
- [ ] **E2E tests** - Real opencode instance, real commands (manual or CI)

Priority: Features 1-8 are core. Feature 9 (auto) is experimental.
