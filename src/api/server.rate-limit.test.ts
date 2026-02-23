import { describe, it, expect, vi, beforeEach } from "vitest";
import http from "node:http";

// Mock dependencies to allow importing server.ts without side effects
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
  },
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
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

// Import the functions to test (will be exported in implementation step)
import { getClientIp, checkRateLimit } from "./server.js";

describe("Rate Limiting", () => {
  describe("getClientIp", () => {
    it("should return x-forwarded-for if present", () => {
      const req = {
        headers: {
          "x-forwarded-for": "10.0.0.1, 192.168.1.1",
        },
        socket: {
          remoteAddress: "127.0.0.1",
        },
      } as unknown as http.IncomingMessage;

      expect(getClientIp(req)).toBe("10.0.0.1");
    });

    it("should return remoteAddress if x-forwarded-for is missing", () => {
      const req = {
        headers: {},
        socket: {
          remoteAddress: "127.0.0.1",
        },
      } as unknown as http.IncomingMessage;

      expect(getClientIp(req)).toBe("127.0.0.1");
    });

    it("should handle missing remoteAddress", () => {
      const req = {
        headers: {},
        socket: {},
      } as unknown as http.IncomingMessage;

      expect(getClientIp(req)).toBe("unknown");
    });
  });

  describe("checkRateLimit", () => {
    let req: http.IncomingMessage;
    let res: http.ServerResponse; // We mock this manually as it's easier than creating a real one

    beforeEach(() => {
        // We need to clear the rate limit map between tests.
        // Since it's module-level state, we might need a helper to clear it,
        // or just rely on using different keys/IPs for each test.
        // For robustness, I'll rely on unique keys.
    });

    it("should allow requests under the limit", () => {
      req = {
        headers: {},
        socket: { remoteAddress: "1.2.3.4" },
      } as unknown as http.IncomingMessage;

      // Mock res with write/end/setHeader
      res = {
          statusCode: 200,
          setHeader: vi.fn(),
          end: vi.fn(),
      } as unknown as http.ServerResponse;

      expect(checkRateLimit(req, res)).toBe(true);
    });

    it("should block requests over the limit", () => {
       const ip = "5.6.7.8";
       req = {
        headers: {},
        socket: { remoteAddress: ip },
      } as unknown as http.IncomingMessage;

      res = {
          statusCode: 200,
          setHeader: vi.fn(),
          end: vi.fn(),
      } as unknown as http.ServerResponse;

      // Assume default limit is 10 per minute (adjust based on implementation)
      // I'll call it 10 times
      for (let i = 0; i < 10; i++) {
          expect(checkRateLimit(req, res)).toBe(true);
      }

      // 11th time should fail
      expect(checkRateLimit(req, res)).toBe(false);
      expect(res.statusCode).toBe(429);
      expect(res.end).toHaveBeenCalled();
    });
  });
});
