import * as dnsPromises from "node:dns/promises";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  isDefaultEndpoint,
  mergeCustomEndpoints,
  normaliseEndpointUrl,
  parseRegistryEndpointUrl,
} from "./registry-client-endpoints.js";

// Mock dependencies
vi.mock("node:dns/promises", () => ({
  lookup: vi.fn(),
}));

vi.mock("@elizaos/core", () => ({
  logger: {
    warn: vi.fn(),
  },
}));

const originalFetch = global.fetch;

describe("registry-client-endpoints", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe("normaliseEndpointUrl", () => {
    it("should remove trailing slashes", () => {
      expect(normaliseEndpointUrl("https://example.com/")).toBe(
        "https://example.com",
      );
      expect(normaliseEndpointUrl("https://example.com//")).toBe(
        "https://example.com",
      );
    });
  });

  describe("isDefaultEndpoint", () => {
    it("should compare normalised URLs", () => {
      expect(
        isDefaultEndpoint("https://example.com/", "https://example.com"),
      ).toBe(true);
      expect(
        isDefaultEndpoint("https://example.com", "https://example.com/"),
      ).toBe(true);
      expect(
        isDefaultEndpoint("https://other.com", "https://example.com"),
      ).toBe(false);
    });
  });

  describe("parseRegistryEndpointUrl", () => {
    it("should throw for invalid URLs", () => {
      expect(() => parseRegistryEndpointUrl("not a url")).toThrow(
        "Endpoint URL must be a valid absolute URL",
      );
    });

    it("should throw for non-https URLs", () => {
      expect(() => parseRegistryEndpointUrl("http://example.com")).toThrow(
        "Endpoint URL must use https://",
      );
    });

    it("should throw for blocked literal hosts", () => {
      expect(() => parseRegistryEndpointUrl("https://localhost")).toThrow(
        "blocked",
      );
      expect(() => parseRegistryEndpointUrl("https://127.0.0.1")).toThrow(
        "blocked",
      );
      expect(() => parseRegistryEndpointUrl("https://[::1]")).toThrow(
        "blocked",
      );
      expect(() => parseRegistryEndpointUrl("https://0.0.0.0")).toThrow(
        "blocked",
      );
    });

    it("should throw for blocked suffixes", () => {
      expect(() => parseRegistryEndpointUrl("https://test.localhost")).toThrow(
        "blocked",
      );
      expect(() => parseRegistryEndpointUrl("https://test.local")).toThrow(
        "blocked",
      );
    });

    it("should return URL for valid host", () => {
      const url = parseRegistryEndpointUrl("https://example.com");
      expect(url.hostname).toBe("example.com");
    });
  });

  describe("mergeCustomEndpoints", () => {
    it("should do nothing if no endpoints are provided", async () => {
      const plugins = new Map();
      await mergeCustomEndpoints(plugins, []);
      expect(plugins.size).toBe(0);
    });

    it("should skip disabled endpoints", async () => {
      const plugins = new Map();
      await mergeCustomEndpoints(plugins, [
        { label: "test", url: "https://example.com", enabled: false },
      ]);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it("should successfully fetch and merge valid endpoints", async () => {
      vi.mocked(dnsPromises.lookup).mockResolvedValue([
        { address: "8.8.8.8", family: 4 },
      ]);

      const mockData = {
        registry: {
          "custom-plugin": {
            description: "A custom plugin",
            git: { repo: "org/custom" },
          },
        },
      };

      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => mockData,
      });

      const plugins = new Map();
      await mergeCustomEndpoints(plugins, [
        { label: "test", url: "https://example.com", enabled: true },
      ]);

      expect(plugins.size).toBe(1);
      const plugin = plugins.get("custom-plugin");
      expect(plugin).toBeDefined();
      expect(plugin?.name).toBe("custom-plugin");
      expect(plugin?.description).toBe("A custom plugin");
    });

    it("should not override existing plugins", async () => {
      vi.mocked(dnsPromises.lookup).mockResolvedValue([
        { address: "8.8.8.8", family: 4 },
      ]);

      const mockData = {
        registry: {
          "existing-plugin": {
            description: "Custom description",
          },
        },
      };

      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => mockData,
      });

      const plugins = new Map();
      plugins.set("existing-plugin", {
        name: "existing-plugin",
        description: "Original description",
      });

      await mergeCustomEndpoints(plugins, [
        { label: "test", url: "https://example.com", enabled: true },
      ]);

      expect(plugins.size).toBe(1);
      expect(plugins.get("existing-plugin")?.description).toBe(
        "Original description",
      );
    });
  });
});
