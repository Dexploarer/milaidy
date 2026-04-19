import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchFromNetwork } from "./registry-client-network.js";

// Mock global fetch
const originalFetch = global.fetch;

describe("Registry Client Network", () => {
  let mockFetch: any;
  let mockApplyLocalWorkspaceApps: any;
  let mockApplyNodeModulePlugins: any;
  let mockSanitizeSandbox: any;

  beforeEach(() => {
    mockFetch = vi.fn();
    global.fetch = mockFetch;

    mockApplyLocalWorkspaceApps = vi.fn().mockResolvedValue(undefined);
    mockApplyNodeModulePlugins = vi.fn().mockResolvedValue(undefined);
    mockSanitizeSandbox = vi.fn((val) => val || "");
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.clearAllMocks();
  });

  const baseParams = {
    generatedRegistryUrl: "https://generated.example.com",
    indexRegistryUrl: "https://index.example.com",
    applyLocalWorkspaceApps: (
      ...args: any[]
    ) => mockApplyLocalWorkspaceApps(...args),
    applyNodeModulePlugins: (
      ...args: any[]
    ) => mockApplyNodeModulePlugins(...args),
    sanitizeSandbox: (
      ...args: any[]
    ) => mockSanitizeSandbox(...args),
  };

  it("should successfully fetch and parse generated registry", async () => {
    const mockData = {
      registry: {
        "plugin-a": {
          git: {
            repo: "org/repo-a",
            v0: { branch: null },
            v1: { branch: null },
            v2: { branch: "main" },
          },
          npm: {
            repo: "@org/plugin-a",
            v0: null,
            v1: null,
            v2: "1.0.0",
          },
          supports: { v0: false, v1: false, v2: true },
          description: "Plugin A description",
          homepage: "https://example.com/a",
          topics: ["test"],
          stargazers_count: 42,
          language: "TypeScript",
          kind: "app",
          app: {
            displayName: "App A",
            category: "tools",
            launchType: "url",
            launchUrl: "https://app-a.com",
            icon: "icon-a",
            capabilities: ["cap1"],
            minPlayers: 1,
            maxPlayers: 4,
            viewer: {
              url: "https://viewer.com",
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

    const plugins = await fetchFromNetwork(baseParams);

    expect(mockFetch).toHaveBeenCalledWith(baseParams.generatedRegistryUrl, {
      redirect: "error",
    });
    expect(mockFetch).toHaveBeenCalledTimes(1);

    expect(plugins.size).toBe(1);
    const plugin = plugins.get("plugin-a");
    expect(plugin).toBeDefined();
    expect(plugin?.name).toBe("plugin-a");
    expect(plugin?.gitRepo).toBe("org/repo-a");
    expect(plugin?.description).toBe("Plugin A description");
    expect(plugin?.kind).toBe("app");
    expect(plugin?.appMeta?.displayName).toBe("App A");
    expect(plugin?.appMeta?.viewer?.sandbox).toBe("allow-scripts");

    expect(mockApplyLocalWorkspaceApps).toHaveBeenCalled();
    expect(mockApplyNodeModulePlugins).toHaveBeenCalled();
    expect(mockSanitizeSandbox).toHaveBeenCalledWith("allow-scripts");
  });

  it("should fallback to index registry if generated registry fails", async () => {
    // Generate registry fails
    mockFetch.mockRejectedValueOnce(new Error("Network Error"));

    // Index registry succeeds
    const indexData = {
      "plugin-b": "github:org/repo-b",
    };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => indexData,
    });

    const plugins = await fetchFromNetwork(baseParams);

    expect(mockFetch).toHaveBeenCalledWith(baseParams.generatedRegistryUrl, {
      redirect: "error",
    });
    expect(mockFetch).toHaveBeenCalledWith(baseParams.indexRegistryUrl, {
      redirect: "error",
    });
    expect(mockFetch).toHaveBeenCalledTimes(2);

    expect(plugins.size).toBe(1);
    const plugin = plugins.get("plugin-b");
    expect(plugin).toBeDefined();
    expect(plugin?.name).toBe("plugin-b");
    expect(plugin?.gitRepo).toBe("org/repo-b");

    expect(mockApplyLocalWorkspaceApps).toHaveBeenCalled();
    expect(mockApplyNodeModulePlugins).toHaveBeenCalled();
  });

  it("should fallback to index registry if generated registry returns non-ok", async () => {
    // Generate registry non-ok
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
    });

    // Index registry succeeds
    const indexData = {
      "plugin-c": "github:org/repo-c",
    };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => indexData,
    });

    const plugins = await fetchFromNetwork(baseParams);

    expect(plugins.size).toBe(1);
    expect(plugins.has("plugin-c")).toBe(true);
  });

  it("should throw if index registry also fails", async () => {
    // Generate registry fails
    mockFetch.mockRejectedValueOnce(new Error("Generate Network Error"));
    // Index registry fails
    mockFetch.mockRejectedValueOnce(new Error("Index Network Error"));

    await expect(fetchFromNetwork(baseParams)).rejects.toThrow(
      "Index Network Error",
    );
  });

  it("should throw if index registry returns non-ok", async () => {
    // Generate registry fails
    mockFetch.mockRejectedValueOnce(new Error("Generate Network Error"));
    // Index registry returns non-ok
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
    });

    await expect(fetchFromNetwork(baseParams)).rejects.toThrow(
      "index.json: 500 Internal Server Error",
    );
  });
});
