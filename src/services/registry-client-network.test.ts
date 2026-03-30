import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchFromNetwork } from "./registry-client-network.js";
import type { RegistryPluginInfo } from "./registry-client.js";

// Mock telemetry
vi.mock("../diagnostics/integration-observability", () => ({
  createIntegrationTelemetrySpan: vi.fn(() => ({
    success: vi.fn(),
    failure: vi.fn(),
  })),
}));

describe("fetchFromNetwork", () => {
  const generatedRegistryUrl = "https://mock.generated/registry.json";
  const indexRegistryUrl = "https://mock.index/index.json";

  const mockApplyLocalWorkspaceApps = vi.fn();
  const mockApplyNodeModulePlugins = vi.fn();
  const mockSanitizeSandbox = vi.fn((val) => val ?? "default-sandbox");

  const defaultParams = {
    generatedRegistryUrl,
    indexRegistryUrl,
    applyLocalWorkspaceApps: mockApplyLocalWorkspaceApps,
    applyNodeModulePlugins: mockApplyNodeModulePlugins,
    sanitizeSandbox: mockSanitizeSandbox,
  };

  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns parsed plugins from generated registry on success", async () => {
    const mockGeneratedData = {
      registry: {
        "test-plugin": {
          git: {
            repo: "test/repo",
            v0: { branch: "main" },
            v1: { branch: null },
            v2: { branch: null },
          },
          npm: {
            repo: "test-plugin-npm",
            v0: "1.0.0",
            v1: null,
            v2: null,
          },
          supports: { v0: true, v1: false, v2: false },
          description: "A test plugin",
          homepage: "https://test.com",
          topics: ["test", "plugin"],
          stargazers_count: 42,
          language: "TypeScript",
        },
      },
    };

    vi.stubGlobal("fetch", vi.fn(async (url) => {
      if (url === generatedRegistryUrl) {
        return {
          ok: true,
          status: 200,
          json: async () => mockGeneratedData,
        };
      }
      return { ok: false, status: 404 };
    }));

    const result = await fetchFromNetwork(defaultParams);

    expect(fetch).toHaveBeenCalledWith(generatedRegistryUrl, { redirect: "error" });
    expect(result.has("test-plugin")).toBe(true);
    const info = result.get("test-plugin")!;
    expect(info.name).toBe("test-plugin");
    expect(info.gitRepo).toBe("test/repo");
    expect(info.description).toBe("A test plugin");
    expect(info.stars).toBe(42);
    expect(info.supports.v0).toBe(true);

    expect(mockApplyLocalWorkspaceApps).toHaveBeenCalledWith(result);
    expect(mockApplyNodeModulePlugins).toHaveBeenCalledWith(result);
  });

  it("handles apps inside generated registry payload correctly", async () => {
    const mockGeneratedData = {
      registry: {
        "test-app": {
          git: {
            repo: "test/app-repo",
            v0: { branch: null },
            v1: { branch: null },
            v2: { branch: "main" },
          },
          npm: {
            repo: "test-app-npm",
            v0: null,
            v1: null,
            v2: "2.0.0",
          },
          supports: { v0: false, v1: false, v2: true },
          description: "A test app",
          homepage: null,
          topics: [],
          stargazers_count: 10,
          language: "TypeScript",
          kind: "app",
          app: {
            displayName: "Test App",
            category: "games",
            launchType: "iframe",
            launchUrl: "https://test.app",
            icon: null,
            capabilities: ["full-screen"],
            minPlayers: 1,
            maxPlayers: null,
            viewer: {
              url: "https://viewer.test.app",
              sandbox: "allow-scripts",
            },
          },
        },
      },
    };

    vi.stubGlobal("fetch", vi.fn(async (url) => {
      if (url === generatedRegistryUrl) {
        return {
          ok: true,
          status: 200,
          json: async () => mockGeneratedData,
        };
      }
      return { ok: false, status: 404 };
    }));

    const result = await fetchFromNetwork(defaultParams);
    const info = result.get("test-app")!;

    expect(info.kind).toBe("app");
    expect(info.appMeta).toBeDefined();
    expect(info.appMeta!.displayName).toBe("Test App");
    expect(info.appMeta!.viewer!.sandbox).toBe("allow-scripts");
    expect(mockSanitizeSandbox).toHaveBeenCalledWith("allow-scripts");
  });

  it("falls back to index registry if generated registry fails with non-ok response", async () => {
    const mockIndexData = {
      "fallback-plugin": "github:fallback/repo",
    };

    vi.stubGlobal("fetch", vi.fn(async (url) => {
      if (url === generatedRegistryUrl) {
        return { ok: false, status: 404 };
      }
      if (url === indexRegistryUrl) {
        return {
          ok: true,
          status: 200,
          json: async () => mockIndexData,
        };
      }
      throw new Error("Unexpected fetch call");
    }));

    const result = await fetchFromNetwork(defaultParams);

    expect(fetch).toHaveBeenCalledWith(generatedRegistryUrl, { redirect: "error" });
    expect(fetch).toHaveBeenCalledWith(indexRegistryUrl, { redirect: "error" });

    expect(result.has("fallback-plugin")).toBe(true);
    const info = result.get("fallback-plugin")!;
    expect(info.gitRepo).toBe("fallback/repo");
    expect(info.gitUrl).toBe("https://github.com/fallback/repo.git");
    expect(info.npm.package).toBe("fallback-plugin");
    expect(info.git.v2Branch).toBe("next");
  });

  it("falls back to index registry if generated registry fetch throws an error", async () => {
    const mockIndexData = {
      "error-fallback": "github:error/repo",
    };

    vi.stubGlobal("fetch", vi.fn(async (url) => {
      if (url === generatedRegistryUrl) {
        throw new Error("Network error");
      }
      if (url === indexRegistryUrl) {
        return {
          ok: true,
          status: 200,
          json: async () => mockIndexData,
        };
      }
      throw new Error("Unexpected fetch call");
    }));

    const result = await fetchFromNetwork(defaultParams);

    expect(result.has("error-fallback")).toBe(true);
  });

  it("throws if index registry fetch also fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url) => {
      if (url === generatedRegistryUrl) {
        return { ok: false, status: 404 };
      }
      if (url === indexRegistryUrl) {
        return { ok: false, status: 500, statusText: "Internal Server Error" };
      }
      throw new Error("Unexpected fetch call");
    }));

    await expect(fetchFromNetwork(defaultParams)).rejects.toThrow("index.json: 500 Internal Server Error");
  });

  it("throws if index registry fetch throws an error", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url) => {
      if (url === generatedRegistryUrl) {
        throw new Error("Generated network error");
      }
      if (url === indexRegistryUrl) {
        throw new Error("Index network error");
      }
      throw new Error("Unexpected fetch call");
    }));

    await expect(fetchFromNetwork(defaultParams)).rejects.toThrow("Index network error");
  });
});
