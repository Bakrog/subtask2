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

// Parse a parallel item - handles "/cmd args" syntax, plain "cmd", or {command, arguments} object
export function parseParallelItem(p: unknown): ParallelCommand | null {
  if (typeof p === "string") {
    const trimmed = p.trim();
    if (trimmed.startsWith("/")) {
      // Parse /command args syntax
      const [cmdName, ...argParts] = trimmed.slice(1).split(/\s+/);
      return {command: cmdName, arguments: argParts.join(" ") || undefined};
    }
    return {command: trimmed};
  }
  if (typeof p === "object" && p !== null && (p as any).command) {
    return {command: (p as any).command, arguments: (p as any).arguments};
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

// Regex to match $SESSION[n] patterns where n is a number
const SESSION_PATTERN_SOURCE = "\\$SESSION\\[(\\d+)\\]";

export interface SessionReference {
  match: string;
  count: number;
}

/**
 * Extract all $SESSION[n] references from a string
 * Returns array of matches with their count values
 */
export function extractSessionReferences(text: string): SessionReference[] {
  const refs: SessionReference[] = [];
  const regex = new RegExp(SESSION_PATTERN_SOURCE, "g");
  let match: RegExpExecArray | null;
  
  while ((match = regex.exec(text)) !== null) {
    refs.push({
      match: match[0],
      count: parseInt(match[1], 10),
    });
  }
  return refs;
}

/**
 * Check if text contains any $SESSION[n] references
 */
export function hasSessionReferences(text: string): boolean {
  // Create a new regex each time to avoid global state issues
  return new RegExp(SESSION_PATTERN_SOURCE).test(text);
}

/**
 * Replace all $SESSION[n] references in text with the provided content map
 * @param text - Text containing $SESSION[n] patterns
 * @param replacements - Map of "$SESSION[n]" -> replacement text
 */
export function replaceSessionReferences(
  text: string,
  replacements: Map<string, string>
): string {
  let result = text;
  for (const [pattern, replacement] of replacements) {
    result = result.replaceAll(pattern, replacement);
  }
  return result;
}
