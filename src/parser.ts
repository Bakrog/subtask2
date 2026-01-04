import YAML from "yaml";
import type {ParallelCommand} from "./types";

export function parseFrontmatter(content: string): Record<string, unknown> {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  try {
    return YAML.parse(match[1]) ?? {};
  } catch {
    return {};
  }
}

export function getTemplateBody(content: string): string {
  const match = content.match(/^---\n[\s\S]*?\n---\n([\s\S]*)$/);
  return match ? match[1].trim() : content.trim();
}

// Parse a parallel item - handles "/cmd{model:...} args" syntax, plain "cmd", or {command, arguments} object
export function parseParallelItem(p: unknown): ParallelCommand | null {
  if (typeof p === "string") {
    const trimmed = p.trim();
    if (trimmed.startsWith("/")) {
      // Parse /command{overrides} args syntax
      const parsed = parseCommandWithOverrides(trimmed);
      return {
        command: parsed.command,
        arguments: parsed.arguments,
        model: parsed.overrides.model,
      };
    }
    return {command: trimmed};
  }
  if (typeof p === "object" && p !== null && (p as any).command) {
    return {
      command: (p as any).command,
      arguments: (p as any).arguments,
      model: (p as any).model,
    };
  }
  return null;
}

export function parseParallelConfig(parallel: unknown): ParallelCommand[] {
  if (!parallel) return [];
  if (Array.isArray(parallel)) {
    return parallel
      .map(parseParallelItem)
      .filter((p): p is ParallelCommand => p !== null);
  }
  if (typeof parallel === "string") {
    // Split by comma, parse each
    return parallel
      .split(",")
      .map(parseParallelItem)
      .filter((p): p is ParallelCommand => p !== null);
  }
  return [];
}

// $TURN[n] - last n messages
// $TURN[:n] or $TURN[:n:m:o] - specific messages at indices (1-based from end)
const TURN_LAST_N_PATTERN = "\\$TURN\\[(\\d+)\\]";
const TURN_SPECIFIC_PATTERN = "\\$TURN\\[([:\\d]+)\\]";

export type TurnReference = 
  | { type: "lastN"; match: string; count: number }
  | { type: "specific"; match: string; indices: number[] }
  | { type: "all"; match: string };

/**
 * Extract all $TURN references from a string
 * - $TURN[n] -> last n messages
 * - $TURN[:n] or $TURN[:2:5:8] -> specific indices (1-based from end)
 */
export function extractTurnReferences(text: string): TurnReference[] {
  const refs: TurnReference[] = [];
  
  // Match $TURN[...] patterns
  const regex = /\$TURN\[([^\]]+)\]/g;
  let match: RegExpExecArray | null;
  
  while ((match = regex.exec(text)) !== null) {
    const inner = match[1];
    
    if (inner === "*") {
      // All messages: $TURN[*]
      refs.push({ type: "all", match: match[0] });
    } else if (inner.startsWith(":")) {
      // Specific indices: $TURN[:2] or $TURN[:2:5:8]
      const indices = inner.split(":").filter(Boolean).map(n => parseInt(n, 10));
      if (indices.length > 0 && indices.every(n => !isNaN(n))) {
        refs.push({ type: "specific", match: match[0], indices });
      }
    } else {
      // Last N: $TURN[5]
      const count = parseInt(inner, 10);
      if (!isNaN(count)) {
        refs.push({ type: "lastN", match: match[0], count });
      }
    }
  }
  return refs;
}

/**
 * Check if text contains any $TURN references
 */
export function hasTurnReferences(text: string): boolean {
  return /\$TURN\[[^\]]+\]/.test(text);
}

/**
 * Replace all $TURN references in text with the provided content map
 */
export function replaceTurnReferences(
  text: string,
  replacements: Map<string, string>
): string {
  let result = text;
  for (const [pattern, replacement] of replacements) {
    result = result.replaceAll(pattern, replacement);
  }
  return result;
}

// Keep old names as aliases for backward compat during transition
export const extractSessionReferences = extractTurnReferences;
export const hasSessionReferences = hasTurnReferences;
export const replaceSessionReferences = replaceTurnReferences;
export type SessionReference = TurnReference;

export interface CommandOverrides {
  model?: string;
}

export interface ParsedCommand {
  command: string;
  arguments?: string;
  overrides: CommandOverrides;
}

/**
 * Parse a command string with optional overrides: /cmd{model:provider/model-id} args
 * Syntax: /command{key:value,key2:value2} arguments
 * No space between command and {overrides}
 */
export function parseCommandWithOverrides(input: string): ParsedCommand {
  const trimmed = input.trim();
  
  if (!trimmed.startsWith("/")) {
    return {command: trimmed, overrides: {}};
  }
  
  // Match: /command{...} or /command
  // Pattern: /commandName{overrides} rest
  const match = trimmed.match(/^\/([a-zA-Z0-9_\-\/]+)(\{([^}]+)\})?\s*(.*)$/);
  
  if (!match) {
    // Fallback: just split on first space
    const [cmd, ...rest] = trimmed.slice(1).split(/\s+/);
    return {command: cmd, arguments: rest.join(" ") || undefined, overrides: {}};
  }
  
  const [, commandName, , overridesStr, args] = match;
  const overrides: CommandOverrides = {};
  
  if (overridesStr) {
    // Parse key:value pairs separated by commas
    const pairs = overridesStr.split(",");
    for (const pair of pairs) {
      const colonIdx = pair.indexOf(":");
      if (colonIdx > 0) {
        const key = pair.slice(0, colonIdx).trim();
        const value = pair.slice(colonIdx + 1).trim();
        if (key === "model") {
          overrides.model = value;
        }
        // Can add more override keys here in the future
      }
    }
  }
  
  return {
    command: commandName,
    arguments: args || undefined,
    overrides,
  };
}
