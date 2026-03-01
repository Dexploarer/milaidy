import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { resolveTerminalRunLimits } from "./terminal-run-limits";

describe("resolveTerminalRunLimits", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns default values when environment variables are not set", () => {
    delete process.env.MILADY_TERMINAL_MAX_CONCURRENT;
    delete process.env.MILAIDY_TERMINAL_MAX_CONCURRENT;
    delete process.env.MILADY_TERMINAL_MAX_DURATION_MS;
    delete process.env.MILAIDY_TERMINAL_MAX_DURATION_MS;

    const limits = resolveTerminalRunLimits();
    expect(limits.maxConcurrent).toBe(2);
    expect(limits.maxDurationMs).toBe(300000); // 5 * 60 * 1000
  });

  it("parses MILADY_ environment variables correctly", () => {
    process.env.MILADY_TERMINAL_MAX_CONCURRENT = "5";
    process.env.MILADY_TERMINAL_MAX_DURATION_MS = "600000";

    const limits = resolveTerminalRunLimits();
    expect(limits.maxConcurrent).toBe(5);
    expect(limits.maxDurationMs).toBe(600000);
  });

  it("parses MILAIDY_ legacy environment variables correctly", () => {
    delete process.env.MILADY_TERMINAL_MAX_CONCURRENT;
    delete process.env.MILADY_TERMINAL_MAX_DURATION_MS;

    process.env.MILAIDY_TERMINAL_MAX_CONCURRENT = "3";
    process.env.MILAIDY_TERMINAL_MAX_DURATION_MS = "120000";

    const limits = resolveTerminalRunLimits();
    expect(limits.maxConcurrent).toBe(3);
    expect(limits.maxDurationMs).toBe(120000);
  });

  it("prefers MILADY_ over MILAIDY_ environment variables", () => {
    process.env.MILADY_TERMINAL_MAX_CONCURRENT = "4";
    process.env.MILAIDY_TERMINAL_MAX_CONCURRENT = "3";

    process.env.MILADY_TERMINAL_MAX_DURATION_MS = "600000";
    process.env.MILAIDY_TERMINAL_MAX_DURATION_MS = "120000";

    const limits = resolveTerminalRunLimits();
    expect(limits.maxConcurrent).toBe(4);
    expect(limits.maxDurationMs).toBe(600000);
  });

  it("clamps maxConcurrent to cap (16)", () => {
    process.env.MILADY_TERMINAL_MAX_CONCURRENT = "20";
    const limits = resolveTerminalRunLimits();
    expect(limits.maxConcurrent).toBe(16);
  });

  it("clamps maxConcurrent to min (1)", () => {
    process.env.MILADY_TERMINAL_MAX_CONCURRENT = "0";
    const limits = resolveTerminalRunLimits();
    expect(limits.maxConcurrent).toBe(1);
  });

  it("clamps maxDurationMs to cap (3600000)", () => {
    process.env.MILADY_TERMINAL_MAX_DURATION_MS = "4000000";
    const limits = resolveTerminalRunLimits();
    expect(limits.maxDurationMs).toBe(3600000); // 60 * 60 * 1000
  });

  it("clamps maxDurationMs to min (1000)", () => {
    process.env.MILADY_TERMINAL_MAX_DURATION_MS = "500";
    const limits = resolveTerminalRunLimits();
    expect(limits.maxDurationMs).toBe(1000);
  });

  it("falls back to default on invalid number string", () => {
    process.env.MILADY_TERMINAL_MAX_CONCURRENT = "not_a_number";
    process.env.MILADY_TERMINAL_MAX_DURATION_MS = "invalid";

    const limits = resolveTerminalRunLimits();
    expect(limits.maxConcurrent).toBe(2);
    expect(limits.maxDurationMs).toBe(300000);
  });
});
