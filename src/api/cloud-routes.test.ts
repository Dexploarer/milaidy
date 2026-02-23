import { EventEmitter } from "node:events";
import type { IncomingMessage, ServerResponse } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MilaidyConfig } from "../config/config.js";
import { type CloudRouteState, handleCloudRoute } from "./cloud-routes.js";

// Mock dependencies
vi.mock("../config/config.js", () => ({
  saveMilaidyConfig: vi.fn(),
  loadMilaidyConfig: vi.fn(),
}));

vi.mock("@elizaos/core", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock fetch
const fetchMock = vi.fn();
global.fetch = fetchMock;

// Helper to create mock request/response
function createMocks() {
  const req = new EventEmitter() as unknown as IncomingMessage;
  req.headers = { host: "localhost:2138" };
  req.url = "/";
  req.method = "GET";

  const res = {
    statusCode: 200,
    setHeader: vi.fn(),
    end: vi.fn(),
  } as unknown as ServerResponse;

  return { req, res };
}

describe("handleCloudRoute", () => {
  let state: CloudRouteState;

  beforeEach(() => {
    vi.resetAllMocks();
    state = {
      config: { cloud: {} } as MilaidyConfig,
      cloudManager: {
        getClient: vi.fn(),
        connect: vi.fn(),
        getStatus: vi.fn().mockReturnValue("connected"),
        getActiveAgentId: vi.fn(),
        disconnect: vi.fn(),
        init: vi.fn(),
      } as any,
      runtime: {
        agentId: "test-agent-id",
        character: { secrets: {} },
        updateAgent: vi.fn(),
      } as any,
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("POST /api/cloud/login initiates login session", async () => {
    const { req, res } = createMocks();
    req.method = "POST";

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });

    const handled = await handleCloudRoute(
      req,
      res,
      "/api/cloud/login",
      "POST",
      state,
    );

    expect(handled).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/auth/cli-session"),
      expect.objectContaining({ method: "POST" }),
    );
    expect(res.end).toHaveBeenCalledWith(
      expect.stringContaining('"sessionId"'),
    );
  });

  it("GET /api/cloud/login/status handles authenticated state", async () => {
    const { req, res } = createMocks();
    req.method = "GET";
    req.url = "/api/cloud/login/status?sessionId=test-session";

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: "authenticated",
        apiKey: "test-api-key",
        keyPrefix: "test",
      }),
    });

    const handled = await handleCloudRoute(
      req,
      res,
      "/api/cloud/login/status",
      "GET",
      state,
    );

    expect(handled).toBe(true);
    // Should save config
    const { saveMilaidyConfig } = await import("../config/config.js");
    expect(saveMilaidyConfig).toHaveBeenCalled();
    // Should set env vars
    expect(process.env.ELIZAOS_CLOUD_API_KEY).toBe("test-api-key");
    expect(process.env.ELIZAOS_CLOUD_ENABLED).toBe("true");
    // Should update agent DB
    expect(state.runtime?.updateAgent).toHaveBeenCalled();

    expect(res.end).toHaveBeenCalledWith(
      expect.stringContaining('"authenticated"'),
    );
  });

  it("GET /api/cloud/agents lists agents", async () => {
    const { req, res } = createMocks();
    req.method = "GET";

    const mockAgents = [{ id: "agent-1", name: "Agent 1" }];
    const mockClient = {
      listAgents: vi.fn().mockResolvedValue(mockAgents),
    };
    (state.cloudManager!.getClient as any).mockReturnValue(mockClient);

    const handled = await handleCloudRoute(
      req,
      res,
      "/api/cloud/agents",
      "GET",
      state,
    );

    expect(handled).toBe(true);
    expect(mockClient.listAgents).toHaveBeenCalled();
    expect(res.end).toHaveBeenCalledWith(expect.stringContaining("Agent 1"));
  });

  it("POST /api/cloud/agents/:id/provision calls connect", async () => {
    const { req, res } = createMocks();
    req.method = "POST";
    const agentId = "00000000-0000-0000-0000-000000000001";

    (state.cloudManager!.connect as any).mockResolvedValue({
      agentName: "Remote Agent",
    });

    const handled = await handleCloudRoute(
      req,
      res,
      `/api/cloud/agents/${agentId}/provision`,
      "POST",
      state,
    );

    expect(handled).toBe(true);
    expect(state.cloudManager!.connect).toHaveBeenCalledWith(agentId);
    expect(res.end).toHaveBeenCalledWith(
      expect.stringContaining("Remote Agent"),
    );
  });

  it("returns false for unhandled routes", async () => {
    const { req, res } = createMocks();
    const handled = await handleCloudRoute(
      req,
      res,
      "/api/cloud/unknown",
      "GET",
      state,
    );
    expect(handled).toBe(false);
  });
});
