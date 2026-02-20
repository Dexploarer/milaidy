import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { checkRateLimit } from "./server.js";

// Mock dependencies to allow importing server.js without side effects
vi.mock("@elizaos/core", () => ({
  logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
  ChannelType: {},
  createMessageMemory: vi.fn(),
  stringToUuid: vi.fn(),
}));

vi.mock("fs", () => ({
  default: { existsSync: vi.fn(), readFileSync: vi.fn() },
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
}));

vi.mock("../config/config.js", () => ({
  loadMilaidyConfig: vi.fn(),
  saveMilaidyConfig: vi.fn(),
  configFileExists: vi.fn(),
}));

vi.mock("../cloud/cloud-manager.js", () => ({ CloudManager: class {} }));
vi.mock("../services/agent-export.js", () => ({ exportAgent: vi.fn(), importAgent: vi.fn() }));
vi.mock("../services/app-manager.js", () => ({ AppManager: class {} }));
vi.mock("../services/mcp-marketplace.js", () => ({ getMcpServerDetails: vi.fn(), searchMcpMarketplace: vi.fn() }));
vi.mock("../services/skill-marketplace.js", () => ({
  installMarketplaceSkill: vi.fn(),
  listInstalledMarketplaceSkills: vi.fn(),
  searchSkillsMarketplace: vi.fn(),
  uninstallMarketplaceSkill: vi.fn(),
}));
vi.mock("./cloud-routes.js", () => ({ handleCloudRoute: vi.fn() }));
vi.mock("./database.js", () => ({ handleDatabaseRoute: vi.fn() }));
vi.mock("./plugin-validation.js", () => ({ validatePluginConfig: vi.fn() }));
vi.mock("./wallet.js", () => ({ fetchEvmBalances: vi.fn() }));

describe("Rate Limiting Logic", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows requests under the limit", () => {
    const state: any = {
      rateLimitMap: new Map(),
    };
    const key = "test-ip";
    const limit = 5;
    const windowMs = 60000;

    // 1st request
    expect(checkRateLimit(state, key, limit, windowMs)).toBe(true);
    expect(state.rateLimitMap.get(key).count).toBe(1);

    // 2nd request
    expect(checkRateLimit(state, key, limit, windowMs)).toBe(true);
    expect(state.rateLimitMap.get(key).count).toBe(2);
  });

  it("blocks requests over the limit", () => {
    const state: any = {
      rateLimitMap: new Map(),
    };
    const key = "test-ip-block";
    const limit = 2;
    const windowMs = 60000;

    // 1st request
    expect(checkRateLimit(state, key, limit, windowMs)).toBe(true);
    // 2nd request
    expect(checkRateLimit(state, key, limit, windowMs)).toBe(true);
    // 3rd request (blocked)
    expect(checkRateLimit(state, key, limit, windowMs)).toBe(false);

    expect(state.rateLimitMap.get(key).count).toBe(2);
  });

  it("resets limit after window expires", () => {
    const state: any = {
      rateLimitMap: new Map(),
    };
    const key = "test-ip-reset";
    const limit = 1;
    const windowMs = 1000;

    const now = Date.now();
    vi.setSystemTime(now);

    // 1st request - allowed
    expect(checkRateLimit(state, key, limit, windowMs)).toBe(true);

    // 2nd request within window - blocked
    expect(checkRateLimit(state, key, limit, windowMs)).toBe(false);

    // Advance time past window
    vi.setSystemTime(now + windowMs + 100);

    // Request after window - allowed (count resets to 1)
    expect(checkRateLimit(state, key, limit, windowMs)).toBe(true);
    expect(state.rateLimitMap.get(key).count).toBe(1);

    const entry = state.rateLimitMap.get(key);
    expect(entry.resetAt).toBeGreaterThan(now + windowMs);
  });

  it("handles missing rateLimitMap gracefully", () => {
    const state: any = {}; // No map
    // Should return true (fail open) if map is missing
    expect(checkRateLimit(state, "key", 1, 1000)).toBe(true);
  });
});
