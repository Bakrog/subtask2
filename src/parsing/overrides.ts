import type { LoopConfig } from "../types";

export interface CommandOverrides {
  model?: string;
  agent?: string;
  loop?: LoopConfig;
}

/**
 * Parse overrides string like "model:foo/bar||loop:10||until:condition"
 * Uses || as separator to allow commas in until conditions
 */
export function parseOverridesString(overridesStr: string): CommandOverrides {
  const overrides: CommandOverrides = {};

  // Parse key:value pairs separated by ||
  const pairs = overridesStr.split("||");
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
        // loop:10 - just max iterations, no until marker
        const max = parseInt(value, 10);
        if (!isNaN(max) && max > 0) {
          overrides.loop = { max, until: "" };
        }
      } else if (key === "until") {
        // until:condition - set/update until marker
        if (!overrides.loop) {
          overrides.loop = { max: 10, until: value }; // default max=10
        } else {
          overrides.loop.until = value;
        }
      }
    }
  }

  return overrides;
}
