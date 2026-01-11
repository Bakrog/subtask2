import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { DEFAULT_PROMPT, loadConfig } from "../../src/utils/config";
import type { Subtask2Config } from "../../src/types";
import { unlink, writeFile } from "fs/promises";
import { existsSync } from "fs";

const TEST_CONFIG_PATH = `${Bun.env.HOME}/.config/opencode/subtask2.jsonc`;
let originalContent: string | null = null;

describe("config exports", () => {
  it("exports DEFAULT_PROMPT as non-empty string", () => {
    expect(typeof DEFAULT_PROMPT).toBe("string");
    expect(DEFAULT_PROMPT.length).toBeGreaterThan(0);
  });

  it("DEFAULT_PROMPT contains useful instructions", () => {
    expect(DEFAULT_PROMPT.toLowerCase()).toContain("review");
  });
});

describe("Subtask2Config type", () => {
  it("valid config with replace_generic true", () => {
    const config: Subtask2Config = { replace_generic: true };
    expect(config.replace_generic).toBe(true);
  });

  it("valid config with replace_generic false", () => {
    const config: Subtask2Config = { replace_generic: false };
    expect(config.replace_generic).toBe(false);
  });

  it("valid config with optional generic_return", () => {
    const config: Subtask2Config = {
      replace_generic: true,
      generic_return: "custom prompt",
    };
    expect(config.generic_return).toBe("custom prompt");
  });

  it("config without generic_return is valid", () => {
    const config: Subtask2Config = { replace_generic: false };
    expect(config.generic_return).toBeUndefined();
  });
});

describe("loadConfig", () => {
  beforeEach(async () => {
    // Backup existing config if present
    try {
      if (existsSync(TEST_CONFIG_PATH)) {
        const file = Bun.file(TEST_CONFIG_PATH);
        originalContent = await file.text();
      }
    } catch {
      originalContent = null;
    }
  });

  afterEach(async () => {
    // Restore original config
    try {
      if (originalContent !== null) {
        await writeFile(TEST_CONFIG_PATH, originalContent);
      }
    } catch {}
  });

  it("returns valid config when file exists with valid content", async () => {
    await writeFile(
      TEST_CONFIG_PATH,
      JSON.stringify({ replace_generic: true })
    );
    const config = await loadConfig();
    expect(config.replace_generic).toBe(true);
  });

  it("returns config with generic_return when specified", async () => {
    await writeFile(
      TEST_CONFIG_PATH,
      JSON.stringify({ replace_generic: true, generic_return: "custom" })
    );
    const config = await loadConfig();
    expect(config.generic_return).toBe("custom");
  });

  it("handles JSONC comments", async () => {
    await writeFile(
      TEST_CONFIG_PATH,
      `{
        // This is a comment
        "replace_generic": true
        /* block comment */
      }`
    );
    const config = await loadConfig();
    expect(config.replace_generic).toBe(true);
  });

  it("returns default config for invalid JSON", async () => {
    await writeFile(TEST_CONFIG_PATH, "not valid json {{");
    const config = await loadConfig();
    expect(config.replace_generic).toBe(true);
  });

  it("returns default config when replace_generic is not boolean", async () => {
    await writeFile(
      TEST_CONFIG_PATH,
      JSON.stringify({ replace_generic: "yes" })
    );
    const config = await loadConfig();
    expect(config.replace_generic).toBe(true);
  });

  it("returns default config when generic_return is not string", async () => {
    await writeFile(
      TEST_CONFIG_PATH,
      JSON.stringify({ replace_generic: true, generic_return: 123 })
    );
    const config = await loadConfig();
    expect(config.replace_generic).toBe(true);
  });
});
