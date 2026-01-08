import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { log, clearLog } from "../../src/utils/logger";
import { existsSync, readFileSync, rmSync, mkdirSync } from "fs";

const LOG_DIR = `${process.env.HOME}/.config/opencode/plugin/subtask2/logs`;
const LOG_FILE = `${LOG_DIR}/debug.log`;

describe("logger", () => {
  beforeEach(() => {
    // Clear the log before each test
    clearLog();
  });

  describe("log", () => {
    it("logs a simple string message", () => {
      log("test message");
      const content = readFileSync(LOG_FILE, "utf-8");
      expect(content).toContain("test message");
    });

    it("logs multiple arguments", () => {
      log("first", "second", "third");
      const content = readFileSync(LOG_FILE, "utf-8");
      expect(content).toContain("first second third");
    });

    it("logs objects as JSON", () => {
      log({ key: "value", num: 42 });
      const content = readFileSync(LOG_FILE, "utf-8");
      expect(content).toContain('"key": "value"');
      expect(content).toContain('"num": 42');
    });

    it("logs mixed types", () => {
      log("message", { data: true }, 123);
      const content = readFileSync(LOG_FILE, "utf-8");
      expect(content).toContain("message");
      expect(content).toContain('"data": true');
      expect(content).toContain("123");
    });

    it("includes timestamp in ISO format", () => {
      log("timestamped");
      const content = readFileSync(LOG_FILE, "utf-8");
      // ISO timestamp pattern: [2024-01-01T12:00:00.000Z]
      expect(content).toMatch(
        /\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\]/
      );
    });

    it("appends to existing log", () => {
      log("first entry");
      log("second entry");
      const content = readFileSync(LOG_FILE, "utf-8");
      expect(content).toContain("first entry");
      expect(content).toContain("second entry");
    });

    it("handles undefined and null", () => {
      log(undefined, null);
      const content = readFileSync(LOG_FILE, "utf-8");
      expect(content).toContain("undefined null");
    });

    it("handles arrays", () => {
      log([1, 2, 3]);
      const content = readFileSync(LOG_FILE, "utf-8");
      expect(content).toContain("[\n  1,\n  2,\n  3\n]");
    });

    it("handles nested objects", () => {
      log({ outer: { inner: "value" } });
      const content = readFileSync(LOG_FILE, "utf-8");
      expect(content).toContain('"inner": "value"');
    });
  });

  describe("clearLog", () => {
    it("clears the log file", () => {
      log("something");
      expect(readFileSync(LOG_FILE, "utf-8").length).toBeGreaterThan(0);
      clearLog();
      expect(readFileSync(LOG_FILE, "utf-8")).toBe("");
    });

    it("creates empty file if called on empty log", () => {
      clearLog();
      clearLog();
      expect(existsSync(LOG_FILE)).toBe(true);
      expect(readFileSync(LOG_FILE, "utf-8")).toBe("");
    });
  });

  describe("directory creation", () => {
    it("log directory exists after module load", () => {
      expect(existsSync(LOG_DIR)).toBe(true);
    });
  });
});
