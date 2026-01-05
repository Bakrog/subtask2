import { parseOverridesString, type CommandOverrides } from "./overrides";

export interface ParsedCommand {
  command: string;
  arguments?: string;
  overrides: CommandOverrides;
  isInlineSubtask?: boolean; // true for /subtask{...} prompt syntax
}

/**
 * Parse a command string with optional overrides: /cmd{model:provider/model-id} args
 * Also supports inline subtask syntax: /subtask{loop:5,until:condition} prompt text
 * Syntax: /command{key:value,key2:value2} arguments
 * No space between command and {overrides}
 */
export function parseCommandWithOverrides(input: string): ParsedCommand {
  const trimmed = input.trim();

  if (!trimmed.startsWith("/")) {
    return { command: trimmed, overrides: {} };
  }

  // Check for inline subtask syntax: /subtask{...} prompt (case-insensitive)
  const inlineMatch = trimmed.match(
    /^\/[sS][uU][bB][tT][aA][sS][kK]\{([^}]+)\}\s+(.+)$/s
  );
  if (inlineMatch) {
    const [, overridesStr, prompt] = inlineMatch;
    const overrides = parseOverridesString(overridesStr);
    return {
      command: "", // No command - inline prompt
      arguments: prompt,
      overrides,
      isInlineSubtask: true,
    };
  }

  // Match: /command{...} or /command
  // Pattern: /commandName{overrides} rest
  const match = trimmed.match(/^\/([a-zA-Z0-9_\-\/]+)(\{([^}]+)\})?\s*(.*)$/s);

  if (!match) {
    // Fallback: just split on first space
    const [cmd, ...rest] = trimmed.slice(1).split(/\s+/);
    return {
      command: cmd,
      arguments: rest.join(" ") || undefined,
      overrides: {},
    };
  }

  const [, commandName, , overridesStr, args] = match;
  const overrides = overridesStr ? parseOverridesString(overridesStr) : {};

  return {
    command: commandName,
    arguments: args || undefined,
    overrides,
  };
}

export interface ParsedInlineSubtask {
  prompt: string;
  overrides: CommandOverrides;
}

/**
 * Parse /subtask{...} prompt inline subtask syntax
 * Input should NOT include the /subtask prefix
 * Returns null if not valid inline subtask syntax
 */
export function parseInlineSubtask(input: string): ParsedInlineSubtask | null {
  const trimmed = input.trim();

  // Must start with {
  if (!trimmed.startsWith("{")) return null;

  const braceEnd = trimmed.indexOf("}");
  if (braceEnd === -1) return null;

  const overrideStr = trimmed.substring(1, braceEnd);
  const prompt = trimmed.substring(braceEnd + 1).trim();

  if (!prompt) return null;

  // Reuse centralized override parsing logic
  const overrides = parseOverridesString(overrideStr);

  return { prompt, overrides };
}

// Re-export CommandOverrides for convenience
export type { CommandOverrides };
