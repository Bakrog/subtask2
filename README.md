# @openspoon/subtask2

OpenCode plugin that controls what happens **after** a subtask completes.

## The Problem

When a subtask (subagent) finishes and returns to the main agent, the main agent typically just relays the response:

> "Here's what the subagent found: [result]" — _end of turn_

The main agent becomes a passive messenger rather than an active participant.

## The Solution

This plugin adds two frontmatter parameters to subtask commands:

- **`return`**: Injects a prompt at the end of the subtask output, giving the main agent its own task instead of just relaying information
- **`chain`**: Queues follow-up prompts that execute sequentially after the subtask completes

## Installation

Add to your `opencode.json`:

```json
{
  "plugins": ["@openspoon/subtask2"]
}
```

## Usage

Add `return` and/or `chain` to your command frontmatter:

### Example: Code Review Command

`.opencode/command/review.md`

```markdown
---
description: subtask2 return and chain prompt example
agent: general
subtask: true
return: You are the agent in charge of assessing the bug review, challenge, verify and validate it, then discard it or implement it.
chain:
  - Let's now rinse and repeat with PR#356, use the task tool to review it for bugs etc... then assess, challenge, validate -> discard or implement.
  - Rinse and repeat, with next PR.
---

Review PR#355 for bugs, security issues, and code style problems.
```

## How It Works

**Without `return`:**

```
Subagent → "Found 3 bugs in the code" → Main agent → "The subagent found 3 bugs" → END
```

**With `return`:**

```
Subagent → "Found 3 bugs" + "Now assess and implement fixes" → Main agent → *starts working on fixes*
```

The `return` prompt is injected into the subagent's response, so the main agent receives instructions rather than just information to relay.

`chain` then allows you to queue additional prompts that fire sequentially after each completion, enabling simple multi-step automated workflows.

## License

MIT
