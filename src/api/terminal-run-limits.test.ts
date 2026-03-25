import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { resolveTerminalRunLimits } from "./terminal-run-limits";

describe("terminal-run-limits", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    delete process.env.MILADY_TERMINAL_MAX_CONCURRENT;
    delete process.env.MILAIDY_TERMINAL_MAX_CONCURRENT;
    delete process.env.MILADY_TERMINAL_MAX_DURATION_MS;
    delete process.env.MILAIDY_TERMINAL_MAX_DURATION_MS;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("should return default values when no env vars are set", () => {
    const limits = resolveTerminalRunLimits();
    expect(limits.maxConcurrent).toBe(2);
    expect(limits.maxDurationMs).toBe(5 * 60 * 1000);
  });

  it("should parse and use MILADY_ env vars", () => {
    process.env.MILADY_TERMINAL_MAX_CONCURRENT = "5";
    process.env.MILADY_TERMINAL_MAX_DURATION_MS = "60000"; // 1 min
    const limits = resolveTerminalRunLimits();
    expect(limits.maxConcurrent).toBe(5);
    expect(limits.maxDurationMs).toBe(60000);
  });

  it("should parse and use MILAIDY_ env vars as fallback", () => {
    process.env.MILAIDY_TERMINAL_MAX_CONCURRENT = "4";
    process.env.MILAIDY_TERMINAL_MAX_DURATION_MS = "120000"; // 2 mins
    const limits = resolveTerminalRunLimits();
    expect(limits.maxConcurrent).toBe(4);
    expect(limits.maxDurationMs).toBe(120000);
  });

  it("should prioritize MILADY_ over MILAIDY_", () => {
    process.env.MILADY_TERMINAL_MAX_CONCURRENT = "3";
    process.env.MILAIDY_TERMINAL_MAX_CONCURRENT = "8";
    process.env.MILADY_TERMINAL_MAX_DURATION_MS = "10000";
    process.env.MILAIDY_TERMINAL_MAX_DURATION_MS = "20000";
    const limits = resolveTerminalRunLimits();
    expect(limits.maxConcurrent).toBe(3);
    expect(limits.maxDurationMs).toBe(10000);
  });

  it("should clamp values below minimum", () => {
    process.env.MILADY_TERMINAL_MAX_CONCURRENT = "-1";
    process.env.MILADY_TERMINAL_MAX_DURATION_MS = "500";
    const limits = resolveTerminalRunLimits();
    expect(limits.maxConcurrent).toBe(1);
    expect(limits.maxDurationMs).toBe(1000);
  });

  it("should clamp values above maximum", () => {
    process.env.MILADY_TERMINAL_MAX_CONCURRENT = "100";
    process.env.MILADY_TERMINAL_MAX_DURATION_MS = "99999999";
    const limits = resolveTerminalRunLimits();
    expect(limits.maxConcurrent).toBe(16);
    expect(limits.maxDurationMs).toBe(60 * 60 * 1000); // 1 hr cap
  });

  it("should ignore invalid numbers and use default", () => {
    process.env.MILADY_TERMINAL_MAX_CONCURRENT = "abc";
    process.env.MILADY_TERMINAL_MAX_DURATION_MS = "xyz";
    const limits = resolveTerminalRunLimits();
    expect(limits.maxConcurrent).toBe(2);
    expect(limits.maxDurationMs).toBe(5 * 60 * 1000);
  });
});
