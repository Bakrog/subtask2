# Making Return Prompts Visible in TUI

## The Problem

When a `subtask: true` command completes in OpenCode, the system automatically injects a synthetic user message asking the model to "Summarize the task tool output above and continue with your task."

This message is created in `opencode/src/session/prompt.ts`:

```typescript
await Session.updatePart({
  id: Identifier.ascending("part"),
  messageID: summaryUserMsg.id,
  sessionID,
  type: "text",
  text: "Summarize the task tool output above and continue with your task.",
  synthetic: true, // <-- This flag hides the message from TUI
});
```

The `synthetic: true` flag on the TextPart tells the TUI to hide this message from the user. The TUI checks `!part.synthetic` in multiple places to determine visibility.

### The Challenge

The subtask2 plugin uses the `experimental.chat.messages.transform` hook to replace this generic message with a custom return prompt. However:

1. **Transform only affects the LLM**: The transform hook modifies messages sent to the LLM, but the TUI reads directly from the database where `synthetic: true` is already persisted.

2. **Database is already written**: By the time the transform hook runs, the synthetic message has already been saved to the database with `synthetic: true`.

3. **Raw fetch doesn't work**: Direct `fetch()` calls to `localhost:4096` fail in the plugin environment with "Unable to connect" errors.

### What We Tried (That Didn't Work)

1. **Just modifying `synthetic` in transform output**:

   ```typescript
   delete lastGenericPart.synthetic;
   ```

   This only affects the in-memory object, not the persisted database record.

2. **Raw HTTP fetch**:

   ```typescript
   await fetch(`http://localhost:4096/session/${sessionID}/message/${messageID}/part/${partID}`, {...})
   ```

   Fails with connection errors - plugins appear to be sandboxed from direct network access.

3. **Using `client.part.update()`**:
   ```typescript
   await client.part.update({...})
   ```
   The `part` namespace doesn't exist on the client object passed to plugins.

## The Solution

The SDK client passed to plugins (`ctx.client`) has an internal HTTP client at `client.client` that CAN make HTTP requests. This is the same mechanism that powers `client.session.promptAsync()` and other SDK methods.

```typescript
const httpClient = (client as any).client;
if (httpClient?.patch) {
  await httpClient.patch({
    url: `/session/${sessionID}/message/${messageID}/part/${partID}`,
    body: {
      id: partID,
      messageID,
      sessionID,
      type: "text",
      text: newText,
      // Omitting `synthetic` removes the flag, making it visible
    },
  });
}
```

### Why This Works

1. **Same HTTP mechanism**: The internal `client.client` uses the same HTTP transport that the SDK's built-in methods use, which works in the plugin environment.

2. **PATCH endpoint updates the part**: OpenCode's server has a `PATCH /session/:sessionID/message/:messageID/part/:partID` endpoint that updates part data in the database.

3. **Omitting `synthetic` removes it**: When we send the part without the `synthetic` field, it's removed from the database record, making the message visible.

## The Complete Flow

1. Subtask completes
2. OpenCode creates synthetic message with `synthetic: true` and saves to DB
3. Transform hook runs:
   - Replaces the text with the return prompt (for LLM to see)
   - Calls `makePartVisible()` to update the DB (for TUI to see)
4. Internal HTTP client patches the part, removing `synthetic` flag
5. LLM responds to the return prompt
6. TUI shows the return prompt as a visible user message

## Key Insight

The plugin environment has network restrictions that block raw `fetch()` calls, but the SDK client's internal HTTP mechanism (`client.client`) bypasses these restrictions. Always use the SDK client's internals rather than direct network calls when possible.
