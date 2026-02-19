import { describe, it, expect, vi } from "vitest";
import { checkRateLimit } from "./server.js";

// Mock dependencies to allow server.js to import
vi.mock("@elizaos/core", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
  stringToUuid: vi.fn(),
  ChannelType: {},
  createMessageMemory: vi.fn(),
}));
vi.mock("ws", () => ({ WebSocketServer: class {} }));
vi.mock("fs", () => ({
  default: { existsSync: vi.fn(), readFileSync: vi.fn() },
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
}));
vi.mock("../config/config.js", () => ({
  loadMilaidyConfig: vi.fn().mockReturnValue({}),
  configFileExists: vi.fn(),
  saveMilaidyConfig: vi.fn(),
}));
vi.mock("../cloud/cloud-manager.js", () => ({ CloudManager: class {} }));
vi.mock("../services/agent-export.js", () => ({}));
vi.mock("../services/app-manager.js", () => ({ AppManager: class {} }));
vi.mock("../services/mcp-marketplace.js", () => ({}));
vi.mock("../services/skill-marketplace.js", () => ({}));
vi.mock("./cloud-routes.js", () => ({ handleCloudRoute: vi.fn() }));
vi.mock("./database.js", () => ({ handleDatabaseRoute: vi.fn() }));
vi.mock("./plugin-validation.js", () => ({ validatePluginConfig: vi.fn() }));
vi.mock("./wallet.js", () => ({ getWalletAddresses: vi.fn() }));

describe("checkRateLimit", () => {
  it("allows requests within limit", () => {
    const state: any = { rateLimitMap: new Map() };
    const ip = "127.0.0.1";
    const key = "test";
    const limit = 3;
    const windowMs = 1000;

    expect(checkRateLimit(state, ip, key, limit, windowMs)).toBe(true);
    expect(checkRateLimit(state, ip, key, limit, windowMs)).toBe(true);
    expect(checkRateLimit(state, ip, key, limit, windowMs)).toBe(true);
  });

  it("blocks requests exceeding limit", () => {
    const state: any = { rateLimitMap: new Map() };
    const ip = "127.0.0.1";
    const key = "test";
    const limit = 2;
    const windowMs = 1000;

    expect(checkRateLimit(state, ip, key, limit, windowMs)).toBe(true);
    expect(checkRateLimit(state, ip, key, limit, windowMs)).toBe(true);
    expect(checkRateLimit(state, ip, key, limit, windowMs)).toBe(false);
  });

  it("resets after window", async () => {
    const state: any = { rateLimitMap: new Map() };
    const ip = "127.0.0.1";
    const key = "test";
    const limit = 1;
    const windowMs = 50;

    expect(checkRateLimit(state, ip, key, limit, windowMs)).toBe(true);
    expect(checkRateLimit(state, ip, key, limit, windowMs)).toBe(false);

    await new Promise((r) => setTimeout(r, 60));

    expect(checkRateLimit(state, ip, key, limit, windowMs)).toBe(true);
  });

  it("treats different keys separately", () => {
    const state: any = { rateLimitMap: new Map() };
    const ip = "127.0.0.1";
    const limit = 1;
    const windowMs = 1000;

    expect(checkRateLimit(state, ip, "key1", limit, windowMs)).toBe(true);
    expect(checkRateLimit(state, ip, "key1", limit, windowMs)).toBe(false);
    expect(checkRateLimit(state, ip, "key2", limit, windowMs)).toBe(true);
  });

  it("treats different IPs separately", () => {
    const state: any = { rateLimitMap: new Map() };
    const key = "test";
    const limit = 1;
    const windowMs = 1000;

    expect(checkRateLimit(state, "127.0.0.1", key, limit, windowMs)).toBe(true);
    expect(checkRateLimit(state, "127.0.0.1", key, limit, windowMs)).toBe(false);
    expect(checkRateLimit(state, "10.0.0.1", key, limit, windowMs)).toBe(true);
  });
});
