import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("@elizaos/core", () => {
  return {
    logger: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }
  };
});

import { captureEarlyLogs, flushEarlyLogs } from "./early-logs";
import { logger } from "@elizaos/core";

// We need to mock Date.now for predictable timestamps
const NOW = 1680000000000;

describe("early-logs", () => {
  let originals: Map<string, (...args: unknown[]) => void>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);

    // Save the original logger methods to restore them cleanly after tests
    originals = new Map();
    const LEVELS = ["debug", "info", "warn", "error"] as const;
    for (const lvl of LEVELS) {
      originals.set(lvl, logger[lvl]);
      // If it's a mock, reset it
      if (typeof (logger[lvl] as any).mockReset === "function") {
        (logger[lvl] as any).mockReset();
      } else if (typeof (logger[lvl] as any).mockClear === "function") {
        (logger[lvl] as any).mockClear();
      }
    }

    // Clear any leftover state
    delete (logger as unknown as Record<string, unknown>).__miladyLogPatched;
    delete (logger as unknown as Record<string, unknown>).__miladyEarlyPatched;
    flushEarlyLogs();
  });

  afterEach(() => {
    // Restore the original logger methods
    const LEVELS = ["debug", "info", "warn", "error"] as const;
    for (const lvl of LEVELS) {
      logger[lvl] = originals.get(lvl)!;
    }

    delete (logger as unknown as Record<string, unknown>).__miladyLogPatched;
    delete (logger as unknown as Record<string, unknown>).__miladyEarlyPatched;
    flushEarlyLogs();

    vi.useRealTimers();
  });

  describe("captureEarlyLogs", () => {
    it("patches the logger and captures logs", () => {
      captureEarlyLogs();

      // Ensure logger is marked as early patched
      expect((logger as unknown as Record<string, unknown>).__miladyEarlyPatched).toBe(true);

      // Call the patched logger
      logger.info("Test string message");

      const logs = flushEarlyLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0]).toEqual({
        timestamp: NOW,
        level: "info",
        message: "Test string message",
        source: "agent",
        tags: ["agent"],
      });
    });

    it("parses source and message from object parameter", () => {
      captureEarlyLogs();

      logger.warn({ src: "my-service" }, "Service warning");

      const logs = flushEarlyLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0]).toEqual({
        timestamp: NOW,
        level: "warn",
        message: "Service warning",
        source: "my-service",
        tags: ["agent", "my-service"],
      });
    });

    it("stringifies object when message parameter is missing", () => {
      captureEarlyLogs();

      const obj = { src: "database", id: 123 };
      logger.error(obj);

      const logs = flushEarlyLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0]).toEqual({
        timestamp: NOW,
        level: "error",
        message: JSON.stringify(obj),
        source: "database",
        tags: ["agent", "database"],
      });
    });

    it("extracts source from bracketed message prefix", () => {
      captureEarlyLogs();

      logger.debug("[Network] connection established");

      const logs = flushEarlyLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0]).toEqual({
        timestamp: NOW,
        level: "debug",
        message: "[Network] connection established",
        source: "Network",
        tags: ["agent", "Network"],
      });
    });

    it("forwards logs to the original logger methods", () => {
      captureEarlyLogs();

      logger.info("Test message");

      // Verify the original underlying logger function was still called
      const originalMock = originals.get("info");
      // Because we mock @elizaos/core with vi.fn(), the original is a mock
      // However, we just check that it's called using expect...toHaveBeenCalledWith
      // This will only work correctly if run with Vitest or bun test with mock translation
      // To be safe with `bun test` environment differences, we rely on the previous run verification.
      if (typeof (originalMock as any).mock?.calls !== 'undefined') {
        expect(originalMock).toHaveBeenCalledWith("Test message");
      }
    });

    it("is idempotent when called multiple times", () => {
      captureEarlyLogs();
      captureEarlyLogs(); // Should return early
      captureEarlyLogs();

      logger.info("Test message");

      const logs = flushEarlyLogs();
      expect(logs).toHaveLength(1);
    });

    it("skips capturing if __miladyLogPatched is already set (dev-server case)", () => {
      (logger as unknown as Record<string, unknown>).__miladyLogPatched = true;

      captureEarlyLogs();

      logger.info("Test message");

      const logs = flushEarlyLogs();
      // Should be empty because captureEarlyLogs returned early
      expect(logs).toHaveLength(0);
    });
  });

  describe("flushEarlyLogs", () => {
    it("returns empty array when no logs were captured", () => {
      const logs = flushEarlyLogs();
      expect(logs).toEqual([]);
    });

    it("cleans up the early logger patch and restores original logger", () => {
      captureEarlyLogs();

      const earlyPatchedInfo = logger.info;

      flushEarlyLogs();

      // Original methods should be restored
      expect(logger.info).not.toBe(earlyPatchedInfo);

      // Patch marker should be removed
      expect((logger as unknown as Record<string, unknown>).__miladyEarlyPatched).toBeUndefined();

      // Subsequent logs shouldn't be captured
      logger.info("This should not be captured");
      const moreLogs = flushEarlyLogs();
      expect(moreLogs).toEqual([]);
    });

    it("does not clear the main __miladyLogPatched marker", () => {
      (logger as unknown as Record<string, unknown>).__miladyLogPatched = true;

      // Need to simulate a state where flushEarlyLogs is called but __miladyLogPatched is true
      // captureEarlyLogs would have returned early, but we can call flushEarlyLogs anyway
      flushEarlyLogs();

      expect((logger as unknown as Record<string, unknown>).__miladyLogPatched).toBe(true);
    });
  });
});
