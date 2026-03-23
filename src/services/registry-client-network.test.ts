import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchFromNetwork } from "./registry-client-network";
import type { RegistryPluginInfo } from "./registry-client";
import { createIntegrationTelemetrySpan } from "../diagnostics/integration-observability";

// Mock telemetry span so it doesn't do real stuff
vi.mock("../diagnostics/integration-observability", () => {
  return {
    createIntegrationTelemetrySpan: vi.fn(() => ({
      success: vi.fn(),
      failure: vi.fn(),
    })),
  };
});

describe("fetchFromNetwork", () => {
  let originalFetch: typeof global.fetch;
  let mockFetch: ReturnType<typeof vi.fn>;

  const defaultParams = {
    generatedRegistryUrl: "https://example.com/generated.json",
    indexRegistryUrl: "https://example.com/index.json",
    applyLocalWorkspaceApps: vi.fn(async () => {}),
    applyNodeModulePlugins: vi.fn(async () => {}),
    sanitizeSandbox: vi.fn((val?: string) => val || ""),
  };

  beforeEach(() => {
    originalFetch = global.fetch;
    mockFetch = vi.fn();
    global.fetch = mockFetch;
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("successfully fetches generated registry and returns mapped plugins", async () => {
    const mockData = {
      registry: {
        "test-plugin": {
          git: { repo: "test/repo", v0: { branch: null }, v1: { branch: null }, v2: { branch: "main" } },
          npm: { repo: "test-plugin", v0: null, v1: null, v2: "1.0.0" },
          supports: { v0: false, v1: false, v2: true },
          description: "Test description",
          homepage: "https://test.com",
          topics: ["test"],
          stargazers_count: 10,
          language: "TypeScript",
          kind: "app",
          app: {
            displayName: "Test App",
            category: "Game",
            launchType: "url",
            launchUrl: "https://test.com/launch",
            icon: "test-icon",
            capabilities: ["cap1"],
            minPlayers: 1,
            maxPlayers: 4,
            viewer: {
              url: "https://test.com/viewer",
              sandbox: "allow-scripts",
            },
          },
        },
      },
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockData,
    });

    const plugins = await fetchFromNetwork(defaultParams);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith(defaultParams.generatedRegistryUrl, { redirect: "error" });

    expect(plugins.size).toBe(1);
    const plugin = plugins.get("test-plugin");
    expect(plugin).toBeDefined();
    expect(plugin?.name).toBe("test-plugin");
    expect(plugin?.gitRepo).toBe("test/repo");
    expect(plugin?.kind).toBe("app");
    expect(plugin?.appMeta?.displayName).toBe("Test App");
    expect(plugin?.appMeta?.viewer?.sandbox).toBe("allow-scripts");

    // Check injected functions were called
    expect(defaultParams.applyLocalWorkspaceApps).toHaveBeenCalledWith(plugins);
    expect(defaultParams.applyNodeModulePlugins).toHaveBeenCalledWith(plugins);
    expect(defaultParams.sanitizeSandbox).toHaveBeenCalledWith("allow-scripts");

    // Check telemetry was successful
    expect(createIntegrationTelemetrySpan).toHaveBeenCalledWith({
      boundary: "marketplace",
      operation: "fetch_generated_registry",
    });
  });

  it("falls back to index registry when generated registry fails (e.g. 404)", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          "test-fallback-plugin": "github:fallback/repo",
        }),
      });

    const plugins = await fetchFromNetwork(defaultParams);

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch).toHaveBeenNthCalledWith(1, defaultParams.generatedRegistryUrl, { redirect: "error" });
    expect(mockFetch).toHaveBeenNthCalledWith(2, defaultParams.indexRegistryUrl, { redirect: "error" });

    expect(plugins.size).toBe(1);
    const plugin = plugins.get("test-fallback-plugin");
    expect(plugin).toBeDefined();
    expect(plugin?.name).toBe("test-fallback-plugin");
    expect(plugin?.gitRepo).toBe("fallback/repo");
  });

  it("falls back to index registry when generated registry fetch throws an error", async () => {
    mockFetch
      .mockRejectedValueOnce(new Error("Network Error"))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          "test-fallback-plugin": "github:fallback/repo",
        }),
      });

    const plugins = await fetchFromNetwork(defaultParams);

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(plugins.size).toBe(1);
    expect(plugins.get("test-fallback-plugin")).toBeDefined();
  });

  it("throws an error when both generated and index registries fail", async () => {
    mockFetch
      .mockRejectedValueOnce(new Error("Generated Error"))
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
      });

    await expect(fetchFromNetwork(defaultParams)).rejects.toThrow("index.json: 500 Internal Server Error");
  });

  it("throws an error when index registry fetch throws an error", async () => {
    mockFetch
      .mockRejectedValueOnce(new Error("Generated Error"))
      .mockRejectedValueOnce(new Error("Index Error"));

    await expect(fetchFromNetwork(defaultParams)).rejects.toThrow("Index Error");
  });
});
