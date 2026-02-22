import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock dependencies to avoid side effects when importing server.ts
vi.mock("@elizaos/core", () => {
  return {
    logger: {
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
    ChannelType: {},
    createMessageMemory: vi.fn(),
    stringToUuid: vi.fn(),
  };
});

vi.mock("fs", () => ({
  default: {
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    createReadStream: vi.fn(),
    statSync: vi.fn(),
    rmSync: vi.fn(),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    cpSync: vi.fn(),
  },
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  createReadStream: vi.fn(),
  statSync: vi.fn(),
  rmSync: vi.fn(),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  cpSync: vi.fn(),
}));

vi.mock("node:fs", () => ({
  default: {
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    createReadStream: vi.fn(),
    statSync: vi.fn(),
    rmSync: vi.fn(),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    cpSync: vi.fn(),
  },
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  createReadStream: vi.fn(),
  statSync: vi.fn(),
  rmSync: vi.fn(),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  cpSync: vi.fn(),
}));

vi.mock("../config/config.js", () => ({
  loadMilaidyConfig: vi.fn().mockReturnValue({}),
  configFileExists: vi.fn(),
  saveMilaidyConfig: vi.fn(),
}));

vi.mock("../cloud/cloud-manager.js", () => ({
  CloudManager: class {},
}));

vi.mock("../services/agent-export.js", () => ({
  exportAgent: vi.fn(),
  importAgent: vi.fn(),
  estimateExportSize: vi.fn(),
}));

vi.mock("../services/app-manager.js", () => ({
  AppManager: class {},
}));

vi.mock("../services/mcp-marketplace.js", () => ({
  getMcpServerDetails: vi.fn(),
  searchMcpMarketplace: vi.fn(),
}));

vi.mock("../services/skill-marketplace.js", () => ({
  installMarketplaceSkill: vi.fn(),
  listInstalledMarketplaceSkills: vi.fn(),
  searchSkillsMarketplace: vi.fn(),
  uninstallMarketplaceSkill: vi.fn(),
}));

vi.mock("./cloud-routes.js", () => ({
  handleCloudRoute: vi.fn(),
}));

vi.mock("./database.js", () => ({
  handleDatabaseRoute: vi.fn(),
}));

vi.mock("./plugin-validation.js", () => ({
  validatePluginConfig: vi.fn(),
}));

vi.mock("./wallet.js", () => ({
  fetchEvmBalances: vi.fn(),
}));

import { checkRateLimit } from "./server.js";

describe("checkRateLimit", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows requests under the limit", () => {
    // Ip "1.2.3.4", action "test", max 3
    expect(checkRateLimit("1.2.3.4", "test", 3)).toBe(true);
    expect(checkRateLimit("1.2.3.4", "test", 3)).toBe(true);
    expect(checkRateLimit("1.2.3.4", "test", 3)).toBe(true);
  });

  it("blocks requests over the limit", () => {
    const ip = "1.2.3.5";
    const action = "test";
    const max = 2;

    expect(checkRateLimit(ip, action, max)).toBe(true);
    expect(checkRateLimit(ip, action, max)).toBe(true);
    expect(checkRateLimit(ip, action, max)).toBe(false);
  });

  it("resets after the window expires", () => {
    const ip = "1.2.3.6";
    const action = "test";
    const max = 1;
    const window = 1000;

    expect(checkRateLimit(ip, action, max, window)).toBe(true);
    expect(checkRateLimit(ip, action, max, window)).toBe(false);

    vi.advanceTimersByTime(window + 100);

    expect(checkRateLimit(ip, action, max, window)).toBe(true);
  });

  it("tracks different IPs separately", () => {
    const action = "test";
    const max = 1;

    expect(checkRateLimit("1.1.1.1", action, max)).toBe(true);
    expect(checkRateLimit("1.1.1.1", action, max)).toBe(false);

    expect(checkRateLimit("2.2.2.2", action, max)).toBe(true);
  });

  it("tracks different actions separately", () => {
    const ip = "3.3.3.3";
    const max = 1;

    expect(checkRateLimit(ip, "action1", max)).toBe(true);
    expect(checkRateLimit(ip, "action1", max)).toBe(false);

    expect(checkRateLimit(ip, "action2", max)).toBe(true);
  });
});
