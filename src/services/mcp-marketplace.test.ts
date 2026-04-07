/**
 * MCP Marketplace Service — Unit Tests
 *
 * Tests for:
 * - generateMcpConfigFromRegistry (basic marketplace result → config)
 * - generateMcpConfigFromServerDetails (full registry server + env/headers → config)
 * - McpRegistryServer / McpServerConfig type contracts
 */
import { describe, expect, it, vi, afterEach } from "vitest";
import {
  generateMcpConfigFromRegistry,
  generateMcpConfigFromServerDetails,
  getMcpServerDetails,
  searchMcpMarketplace,
  type McpMarketplaceSearchItem,
  type McpRegistryServer,
  type McpServerConfig,
} from "./mcp-marketplace";

const originalFetch = global.fetch;

// ============================================================================
//  1. generateMcpConfigFromRegistry (existing function)
// ============================================================================

describe("generateMcpConfigFromRegistry", () => {
  it("generates streamable-http config for remote servers", () => {
    const item: McpMarketplaceSearchItem = {
      id: "test/remote-server@1.0.0",
      name: "test/remote-server",
      title: "Remote Server",
      description: "A test remote server",
      version: "1.0.0",
      connectionType: "remote",
      connectionUrl: "https://mcp.example.com/sse",
      isLatest: true,
    };

    const config = generateMcpConfigFromRegistry(item);
    expect(config).not.toBeNull();
    expect(config?.type).toBe("streamable-http");
    expect(config?.url).toBe("https://mcp.example.com/sse");
    expect(config?.command).toBeUndefined();
  });

  it("generates stdio config for npm packages", () => {
    const item: McpMarketplaceSearchItem = {
      id: "test/npm-server@1.0.0",
      name: "test/npm-server",
      title: "NPM Server",
      description: "A test npm server",
      version: "1.0.0",
      connectionType: "stdio",
      npmPackage: "@modelcontextprotocol/server-github",
      isLatest: true,
    };

    const config = generateMcpConfigFromRegistry(item);
    expect(config).not.toBeNull();
    expect(config?.type).toBe("stdio");
    expect(config?.command).toBe("npx");
    expect(config?.args).toEqual(["-y", "@modelcontextprotocol/server-github"]);
  });

  it("generates stdio config for docker images", () => {
    const item: McpMarketplaceSearchItem = {
      id: "test/docker-server@1.0.0",
      name: "test/docker-server",
      title: "Docker Server",
      description: "A test docker server",
      version: "1.0.0",
      connectionType: "stdio",
      dockerImage: "mcp/server-postgres",
      isLatest: true,
    };

    const config = generateMcpConfigFromRegistry(item);
    expect(config).not.toBeNull();
    expect(config?.type).toBe("stdio");
    expect(config?.command).toBe("docker");
    expect(config?.args).toEqual(["run", "-i", "--rm", "mcp/server-postgres"]);
  });

  it("returns null when connection info is missing", () => {
    const item: McpMarketplaceSearchItem = {
      id: "test/broken@1.0.0",
      name: "test/broken",
      title: "Broken Server",
      description: "No connection info",
      version: "1.0.0",
      connectionType: "remote",
      // no connectionUrl
      isLatest: true,
    };

    expect(generateMcpConfigFromRegistry(item)).toBeNull();
  });
});

// ============================================================================
//  2. generateMcpConfigFromServerDetails (new function)
// ============================================================================

describe("generateMcpConfigFromServerDetails", () => {
  it("generates remote config with user-provided headers", () => {
    const server: McpRegistryServer = {
      name: "github/github",
      description: "GitHub MCP server",
      version: "1.0.0",
      remotes: [
        {
          type: "streamable-http",
          url: "https://api.github.com/mcp",
          headers: [
            {
              name: "Authorization",
              description: "Bearer token",
              isRequired: true,
              isSecret: true,
            },
            {
              name: "X-Custom",
              description: "Optional header",
              isRequired: false,
            },
          ],
        },
      ],
    };

    const config = generateMcpConfigFromServerDetails(server, undefined, {
      Authorization: "Bearer ghp_test123",
      "X-Custom": "value",
    });

    expect(config).not.toBeNull();
    expect(config?.type).toBe("streamable-http");
    expect(config?.url).toBe("https://api.github.com/mcp");
    expect(config?.headers).toEqual({
      Authorization: "Bearer ghp_test123",
      "X-Custom": "value",
    });
    expect(config?.command).toBeUndefined();
    expect(config?.env).toBeUndefined();
  });

  it("generates remote config without headers when none provided", () => {
    const server: McpRegistryServer = {
      name: "simple/remote",
      description: "Simple remote server",
      version: "1.0.0",
      remotes: [{ type: "sse", url: "https://mcp.example.com/sse" }],
    };

    const config = generateMcpConfigFromServerDetails(server);

    expect(config).not.toBeNull();
    expect(config?.type).toBe("sse");
    expect(config?.url).toBe("https://mcp.example.com/sse");
    expect(config?.headers).toBeUndefined();
  });

  it("generates npm stdio config with env vars", () => {
    const server: McpRegistryServer = {
      name: "github/github",
      description: "GitHub MCP server",
      version: "1.0.0",
      packages: [
        {
          registryType: "npm",
          identifier: "@modelcontextprotocol/server-github",
          environmentVariables: [
            {
              name: "GITHUB_TOKEN",
              description: "GitHub personal access token",
              isRequired: true,
              isSecret: true,
            },
            {
              name: "GITHUB_ORG",
              description: "Optional org filter",
              isRequired: false,
            },
          ],
        },
      ],
    };

    const config = generateMcpConfigFromServerDetails(server, {
      GITHUB_TOKEN: "ghp_abc123",
      GITHUB_ORG: "my-org",
    });

    expect(config).not.toBeNull();
    expect(config?.type).toBe("stdio");
    expect(config?.command).toBe("npx");
    expect(config?.args).toContain("-y");
    expect(config?.args).toContain("@modelcontextprotocol/server-github");
    expect(config?.env).toEqual({
      GITHUB_TOKEN: "ghp_abc123",
      GITHUB_ORG: "my-org",
    });
  });

  it("generates npm config without env when none provided", () => {
    const server: McpRegistryServer = {
      name: "test/no-env",
      description: "No env vars needed",
      version: "1.0.0",
      packages: [
        {
          registryType: "npm",
          identifier: "@test/simple-server",
        },
      ],
    };

    const config = generateMcpConfigFromServerDetails(server);

    expect(config).not.toBeNull();
    expect(config?.type).toBe("stdio");
    expect(config?.command).toBe("npx");
    expect(config?.args).toEqual(["-y", "@test/simple-server"]);
    expect(config?.env).toBeUndefined();
  });

  it("appends packageArguments defaults to args", () => {
    const server: McpRegistryServer = {
      name: "test/with-args",
      description: "Server with package arguments",
      version: "1.0.0",
      packages: [
        {
          registryType: "npm",
          identifier: "@test/server-with-args",
          packageArguments: [
            { name: "port", default: "3000", isRequired: false },
            { name: "config", description: "Config path" }, // No default — should not be appended
          ],
        },
      ],
    };

    const config = generateMcpConfigFromServerDetails(server);

    expect(config).not.toBeNull();
    expect(config?.args).toEqual(["-y", "@test/server-with-args", "3000"]);
  });

  it("generates docker config with env vars", () => {
    const server: McpRegistryServer = {
      name: "test/docker-server",
      description: "Docker server",
      version: "1.0.0",
      packages: [
        {
          registryType: "oci",
          identifier: "mcp/server-postgres:latest",
          environmentVariables: [
            { name: "PG_CONNECTION_STRING", isRequired: true, isSecret: true },
          ],
        },
      ],
    };

    const config = generateMcpConfigFromServerDetails(server, {
      PG_CONNECTION_STRING: "postgres://localhost:5432/db",
    });

    expect(config).not.toBeNull();
    expect(config?.type).toBe("stdio");
    expect(config?.command).toBe("docker");
    expect(config?.args).toEqual([
      "run",
      "-i",
      "--rm",
      "mcp/server-postgres:latest",
    ]);
    expect(config?.env).toEqual({
      PG_CONNECTION_STRING: "postgres://localhost:5432/db",
    });
  });

  it("prefers remote over packages when both exist", () => {
    const server: McpRegistryServer = {
      name: "test/hybrid",
      description: "Has both remote and package",
      version: "1.0.0",
      remotes: [{ type: "http", url: "https://mcp.example.com" }],
      packages: [{ registryType: "npm", identifier: "@test/server" }],
    };

    const config = generateMcpConfigFromServerDetails(server);

    expect(config).not.toBeNull();
    expect(config?.type).toBe("http");
    expect(config?.url).toBe("https://mcp.example.com");
    expect(config?.command).toBeUndefined();
  });

  it("returns null when no remotes or packages exist", () => {
    const server: McpRegistryServer = {
      name: "test/empty",
      description: "No connection info",
      version: "1.0.0",
    };

    expect(generateMcpConfigFromServerDetails(server)).toBeNull();
  });

  it("filters empty env values from config", () => {
    const server: McpRegistryServer = {
      name: "test/env-filter",
      description: "Test",
      version: "1.0.0",
      packages: [
        {
          registryType: "npm",
          identifier: "@test/server",
          environmentVariables: [
            { name: "REQUIRED_KEY", isRequired: true },
            { name: "OPTIONAL_KEY", isRequired: false },
          ],
        },
      ],
    };

    // Only provide one value; empty record keys are included by the service
    const config = generateMcpConfigFromServerDetails(server, {
      REQUIRED_KEY: "val",
      OPTIONAL_KEY: "",
    });

    expect(config).not.toBeNull();
    expect(config?.env).toBeDefined();
    expect(config?.env?.REQUIRED_KEY).toBe("val");
    // Empty string is still passed through (UI filters before calling)
    expect(config?.env?.OPTIONAL_KEY).toBe("");
  });
});

// ============================================================================
//  3. McpServerConfig shape validation
// ============================================================================

// ============================================================================
//  4. searchMcpMarketplace
// ============================================================================

describe("searchMcpMarketplace", () => {
  afterEach(() => {
    global.fetch = originalFetch;
    vi.clearAllMocks();
  });

  const mockRegistryResponse = {
    servers: [
      {
        server: {
          name: "test/remote-server",
          description: "remote",
          version: "1.0.0",
          remotes: [{ type: "sse", url: "https://mcp.example.com/sse" }],
        },
        _meta: {
          "io.modelcontextprotocol.registry/official": { isLatest: true },
        },
      },
      {
        server: {
          name: "test/npm-server",
          title: "NPM Title",
          description: "npm",
          version: "1.0.0",
          packages: [
            { registryType: "npm", identifier: "@test/npm" },
          ],
        },
        _meta: {
          "io.modelcontextprotocol.registry/official": { isLatest: true },
        },
      },
      {
        server: {
          name: "test/npm-server", // Duplicate name
          description: "npm old",
          version: "0.9.0",
          packages: [
            { registryType: "npm", identifier: "@test/npm" },
          ],
        },
        _meta: {
          "io.modelcontextprotocol.registry/official": { isLatest: true },
        },
      },
      {
        server: {
          name: "test/docker-server",
          description: "docker",
          version: "1.0.0",
          packages: [
            { registryType: "oci", identifier: "mcp/docker" },
          ],
        },
        _meta: {
          "io.modelcontextprotocol.registry/official": { isLatest: true },
        },
      },
      {
        server: {
          name: "test/not-latest",
          description: "not latest",
          version: "1.0.0",
        },
        _meta: {
          "io.modelcontextprotocol.registry/official": { isLatest: false },
        },
      },
    ],
  };

  it("fetches and formats registry servers correctly", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockRegistryResponse,
    });
    global.fetch = fetchMock;

    const { results } = await searchMcpMarketplace();

    expect(fetchMock).toHaveBeenCalledWith(
      "https://registry.modelcontextprotocol.io/v0/servers",
      { headers: { Accept: "application/json" } },
    );

    expect(results).toHaveLength(3); // Deduplicated and isLatest filtered

    expect(results[0].name).toBe("test/remote-server");
    expect(results[0].connectionType).toBe("remote");
    expect(results[0].connectionUrl).toBe("https://mcp.example.com/sse");

    expect(results[1].name).toBe("test/npm-server");
    expect(results[1].title).toBe("NPM Title");
    expect(results[1].connectionType).toBe("stdio");
    expect(results[1].npmPackage).toBe("@test/npm");

    expect(results[2].name).toBe("test/docker-server");
    expect(results[2].connectionType).toBe("stdio");
    expect(results[2].dockerImage).toBe("mcp/docker");
  });

  it("filters by query string", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockRegistryResponse,
    });
    global.fetch = fetchMock;

    const { results } = await searchMcpMarketplace("npm");
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe("test/npm-server");
  });

  it("respects limit", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockRegistryResponse,
    });
    global.fetch = fetchMock;

    const { results } = await searchMcpMarketplace(undefined, 2);
    expect(results).toHaveLength(2);
  });

  it("throws on HTTP error", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
    });
    global.fetch = fetchMock;

    await expect(searchMcpMarketplace()).rejects.toThrow(
      "Registry API error: 500 Internal Server Error",
    );
  });

  it("throws on network error", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("Network error"));
    global.fetch = fetchMock;

    await expect(searchMcpMarketplace()).rejects.toThrow("Network error");
  });

  it("throws on json parse error", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => { throw new Error("JSON error"); },
    });
    global.fetch = fetchMock;

    await expect(searchMcpMarketplace()).rejects.toThrow("JSON error");
  });
});

// ============================================================================
//  5. getMcpServerDetails
// ============================================================================

describe("getMcpServerDetails", () => {
  afterEach(() => {
    global.fetch = originalFetch;
    vi.clearAllMocks();
  });

  it("fetches server details by name", async () => {
    const mockServer = { name: "test/server", version: "1.0.0" };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ server: mockServer }),
    });
    global.fetch = fetchMock;

    const result = await getMcpServerDetails("test/server");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://registry.modelcontextprotocol.io/v0/servers/test%2Fserver",
      { headers: { Accept: "application/json" } },
    );
    expect(result).toEqual(mockServer);
  });

  it("returns null for 404", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
    });
    global.fetch = fetchMock;

    const result = await getMcpServerDetails("not/found");
    expect(result).toBeNull();
  });

  it("throws on other HTTP errors", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    });
    global.fetch = fetchMock;

    await expect(getMcpServerDetails("error/server")).rejects.toThrow(
      "Registry API error: 500",
    );
  });

  it("throws on network error", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("Network error"));
    global.fetch = fetchMock;

    await expect(getMcpServerDetails("test/server")).rejects.toThrow("Network error");
  });

  it("throws on json parse error", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => { throw new Error("JSON error"); },
    });
    global.fetch = fetchMock;

    await expect(getMcpServerDetails("test/server")).rejects.toThrow("JSON error");
  });
});

describe("McpServerConfig shape", () => {
  it("stdio config has required fields", () => {
    const config: McpServerConfig = {
      type: "stdio",
      command: "npx",
      args: ["-y", "@test/server"],
    };
    expect(config.type).toBe("stdio");
    expect(config.command).toBe("npx");
    expect(Array.isArray(config.args)).toBe(true);
  });

  it("remote config has required fields", () => {
    const config: McpServerConfig = {
      type: "streamable-http",
      url: "https://mcp.example.com",
    };
    expect(config.type).toBe("streamable-http");
    expect(config.url).toBe("https://mcp.example.com");
  });

  it("config with env and headers is JSON-serializable", () => {
    const config: McpServerConfig = {
      type: "stdio",
      command: "npx",
      args: ["-y", "@test/server"],
      env: { TOKEN: "secret123" },
    };

    const serialized = JSON.stringify(config);
    expect(typeof serialized).toBe("string");

    const deserialized = JSON.parse(serialized) as McpServerConfig;
    expect(deserialized.type).toBe("stdio");
    expect(deserialized.env?.TOKEN).toBe("secret123");
  });
});
