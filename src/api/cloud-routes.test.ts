import { EventEmitter } from "node:events";
import type { IncomingMessage, ServerResponse } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type CloudRouteState, handleCloudRoute } from "./cloud-routes.js";

// Mock dependencies
const { mockSaveMilaidyConfig } = vi.hoisted(() => ({
  mockSaveMilaidyConfig: vi.fn(),
}));

vi.mock("../config/config.js", () => ({
  saveMilaidyConfig: mockSaveMilaidyConfig,
}));

// Mock logger to avoid console noise
vi.mock("@elizaos/core", async () => {
  const actual = await vi.importActual("@elizaos/core");
  return {
    ...actual,
    logger: {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
    },
  };
});

// Helper to create mock request/response
function createMockReqRes(
  method: string,
  url: string,
  body?: unknown,
): { req: IncomingMessage; res: ServerResponse; resBody: Promise<unknown> } {
  const req = new EventEmitter() as unknown as IncomingMessage;
  Object.assign(req, {
    method,
    url,
    headers: { host: "localhost" },
  });

  const res = new EventEmitter() as unknown as ServerResponse;
  let responseData = "";
  const resBody = new Promise((resolve) => {
    res.end = (chunk: unknown) => {
      if (chunk) responseData += String(chunk);
      try {
        resolve(JSON.parse(responseData));
      } catch {
        resolve(responseData);
      }
    };
    res.setHeader = vi.fn();
    (res as unknown as { statusCode: number }).statusCode = 200;
  });

  // Simulate body if provided
  if (body) {
    process.nextTick(() => {
      req.emit("data", Buffer.from(JSON.stringify(body)));
      req.emit("end");
    });
  } else {
    process.nextTick(() => {
      req.emit("end");
    });
  }

  return { req, res, resBody };
}

describe("Cloud Routes", () => {
  let state: CloudRouteState;
  // biome-ignore lint/suspicious/noExplicitAny: Mocking complex class
  let mockCloudManager: any;
  // biome-ignore lint/suspicious/noExplicitAny: Mocking complex class
  let mockRuntime: any;

  beforeEach(() => {
    vi.resetAllMocks();
    global.fetch = vi.fn();

    mockCloudManager = {
      getClient: vi.fn(),
      init: vi.fn(),
      connect: vi.fn(),
      disconnect: vi.fn(),
      getStatus: vi.fn().mockReturnValue("disconnected"),
      getActiveAgentId: vi.fn(),
    };

    mockRuntime = {
      agentId: "test-agent-id",
      character: { secrets: {} },
      updateAgent: vi.fn().mockResolvedValue(true),
    };

    state = {
      config: {
        cloud: {
          enabled: false,
        },
      },
      cloudManager: mockCloudManager,
      runtime: mockRuntime,
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.ELIZAOS_CLOUD_API_KEY;
    delete process.env.ELIZAOS_CLOUD_ENABLED;
  });

  describe("POST /api/cloud/login", () => {
    it("creates a session successfully", async () => {
      const { req, res, resBody } = createMockReqRes(
        "POST",
        "/api/cloud/login",
      );
      // biome-ignore lint/suspicious/noExplicitAny: Mocking fetch
      (global.fetch as any).mockResolvedValue({
        ok: true,
      } as Response);

      const handled = await handleCloudRoute(
        req,
        res,
        "/api/cloud/login",
        "POST",
        state,
      );
      expect(handled).toBe(true);

      const body = (await resBody) as {
        ok: boolean;
        sessionId: string;
        browserUrl: string;
      };
      expect(body.ok).toBe(true);
      expect(body.sessionId).toBeDefined();
      expect(body.browserUrl).toContain(body.sessionId);
    });

    it("handles upstream failure", async () => {
      const { req, res, resBody } = createMockReqRes(
        "POST",
        "/api/cloud/login",
      );
      // biome-ignore lint/suspicious/noExplicitAny: Mocking fetch
      (global.fetch as any).mockResolvedValue({
        ok: false,
      } as Response);

      const handled = await handleCloudRoute(
        req,
        res,
        "/api/cloud/login",
        "POST",
        state,
      );
      expect(handled).toBe(true);

      const body = (await resBody) as { error: string };
      expect(body.error).toBeDefined();
      expect((res as unknown as { statusCode: number }).statusCode).toBe(502);
    });
  });

  describe("GET /api/cloud/login/status", () => {
    it("returns error if sessionId is missing", async () => {
      const { req, res, resBody } = createMockReqRes(
        "GET",
        "/api/cloud/login/status",
      );

      const handled = await handleCloudRoute(
        req,
        res,
        "/api/cloud/login/status",
        "GET",
        state,
      );
      expect(handled).toBe(true);

      const body = (await resBody) as { error: string };
      expect(body.error).toContain("sessionId query parameter is required");
    });

    it("handles polling failure (404)", async () => {
      const sessionId = "test-session-id";
      const { req, res, resBody } = createMockReqRes(
        "GET",
        `/api/cloud/login/status?sessionId=${sessionId}`,
      );

      // biome-ignore lint/suspicious/noExplicitAny: Mocking fetch
      (global.fetch as any).mockResolvedValue({
        ok: false,
        status: 404,
      } as Response);

      const handled = await handleCloudRoute(
        req,
        res,
        "/api/cloud/login/status",
        "GET",
        state,
      );
      expect(handled).toBe(true);

      const body = (await resBody) as { status: string };
      expect(body.status).toBe("expired");
    });

    it("handles successful authentication", async () => {
      const sessionId = "test-session-id";
      const apiKey = "test-api-key";
      const { req, res, resBody } = createMockReqRes(
        "GET",
        `/api/cloud/login/status?sessionId=${sessionId}`,
      );

      // biome-ignore lint/suspicious/noExplicitAny: Mocking fetch
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({ status: "authenticated", apiKey }),
      } as Response);

      const handled = await handleCloudRoute(
        req,
        res,
        "/api/cloud/login/status",
        "GET",
        state,
      );
      expect(handled).toBe(true);

      const body = (await resBody) as { status: string };
      expect(body.status).toBe("authenticated");

      // Verify side effects
      expect(mockSaveMilaidyConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          cloud: expect.objectContaining({
            enabled: true,
            apiKey,
          }),
        }),
      );

      expect(process.env.ELIZAOS_CLOUD_API_KEY).toBe(apiKey);
      expect(process.env.ELIZAOS_CLOUD_ENABLED).toBe("true");

      expect(mockRuntime.updateAgent).toHaveBeenCalledWith(
        mockRuntime.agentId,
        expect.objectContaining({
          secrets: expect.objectContaining({
            ELIZAOS_CLOUD_API_KEY: apiKey,
            ELIZAOS_CLOUD_ENABLED: "true",
          }),
        }),
      );

      // Should attempt to init cloud manager
      expect(mockCloudManager.init).toHaveBeenCalled();
    });
  });

  describe("GET /api/cloud/agents", () => {
    it("returns 401 if not connected", async () => {
      const { req, res, resBody } = createMockReqRes(
        "GET",
        "/api/cloud/agents",
      );
      mockCloudManager.getClient.mockReturnValue(null);

      const handled = await handleCloudRoute(
        req,
        res,
        "/api/cloud/agents",
        "GET",
        state,
      );
      expect(handled).toBe(true);

      const body = (await resBody) as { error: string };
      expect((res as unknown as { statusCode: number }).statusCode).toBe(401);
      expect(body.error).toContain("Not connected");
    });

    it("returns agent list on success", async () => {
      const { req, res, resBody } = createMockReqRes(
        "GET",
        "/api/cloud/agents",
      );
      const mockClient = {
        listAgents: vi.fn().mockResolvedValue([{ id: "a1" }]),
      };
      mockCloudManager.getClient.mockReturnValue(mockClient);

      const handled = await handleCloudRoute(
        req,
        res,
        "/api/cloud/agents",
        "GET",
        state,
      );
      expect(handled).toBe(true);

      const body = (await resBody) as { ok: boolean; agents: unknown[] };
      expect(body.ok).toBe(true);
      expect(body.agents).toHaveLength(1);
    });
  });

  describe("POST /api/cloud/agents", () => {
    it("returns 401 if not connected", async () => {
      const { req, res, resBody } = createMockReqRes(
        "POST",
        "/api/cloud/agents",
        {},
      );
      mockCloudManager.getClient.mockReturnValue(null);

      const handled = await handleCloudRoute(
        req,
        res,
        "/api/cloud/agents",
        "POST",
        state,
      );
      expect(handled).toBe(true);

      await resBody;
      expect((res as unknown as { statusCode: number }).statusCode).toBe(401);
    });

    it("validates request body", async () => {
      const { req, res, resBody } = createMockReqRes(
        "POST",
        "/api/cloud/agents",
        {},
      ); // Empty object
      const mockClient = {};
      mockCloudManager.getClient.mockReturnValue(mockClient);

      const handled = await handleCloudRoute(
        req,
        res,
        "/api/cloud/agents",
        "POST",
        state,
      );
      expect(handled).toBe(true);

      const body = (await resBody) as { error: string };
      expect(body.error).toContain("agentName is required");
    });

    it("creates agent successfully", async () => {
      const { req, res, resBody } = createMockReqRes(
        "POST",
        "/api/cloud/agents",
        { agentName: "test-agent" },
      );
      const mockClient = {
        createAgent: vi
          .fn()
          .mockResolvedValue({ id: "new-agent", name: "test-agent" }),
      };
      mockCloudManager.getClient.mockReturnValue(mockClient);

      const handled = await handleCloudRoute(
        req,
        res,
        "/api/cloud/agents",
        "POST",
        state,
      );
      expect(handled).toBe(true);

      const body = (await resBody) as { ok: boolean; agent: { name: string } };
      expect(body.ok).toBe(true);
      expect(body.agent.name).toBe("test-agent");
      expect((res as unknown as { statusCode: number }).statusCode).toBe(201);
    });
  });

  describe("POST /api/cloud/agents/:id/provision", () => {
    it("provisions agent successfully", async () => {
      const agentId = "00000000-0000-0000-0000-000000000001";
      const { req, res, resBody } = createMockReqRes(
        "POST",
        `/api/cloud/agents/${agentId}/provision`,
      );

      mockCloudManager.connect.mockResolvedValue({
        agentName: "proxied-agent",
      });
      mockCloudManager.getStatus.mockReturnValue("connected");

      const handled = await handleCloudRoute(
        req,
        res,
        `/api/cloud/agents/${agentId}/provision`,
        "POST",
        state,
      );
      expect(handled).toBe(true);

      const body = (await resBody) as { ok: boolean; agentName: string };
      expect(body.ok).toBe(true);
      expect(body.agentName).toBe("proxied-agent");
      expect(mockCloudManager.connect).toHaveBeenCalledWith(agentId);
    });
  });

  describe("POST /api/cloud/agents/:id/shutdown", () => {
    it("shuts down agent successfully", async () => {
      const agentId = "00000000-0000-0000-0000-000000000001";
      const { req, res, resBody } = createMockReqRes(
        "POST",
        `/api/cloud/agents/${agentId}/shutdown`,
      );

      const mockClient = { deleteAgent: vi.fn().mockResolvedValue(true) };
      mockCloudManager.getClient.mockReturnValue(mockClient);
      mockCloudManager.getActiveAgentId.mockReturnValue(agentId);

      const handled = await handleCloudRoute(
        req,
        res,
        `/api/cloud/agents/${agentId}/shutdown`,
        "POST",
        state,
      );
      expect(handled).toBe(true);

      const body = (await resBody) as { ok: boolean };
      expect(body.ok).toBe(true);
      expect(mockCloudManager.disconnect).toHaveBeenCalled();
      expect(mockClient.deleteAgent).toHaveBeenCalledWith(agentId);
    });
  });

  describe("POST /api/cloud/agents/:id/connect", () => {
    it("connects to agent successfully", async () => {
      const agentId = "00000000-0000-0000-0000-000000000001";
      const { req, res, resBody } = createMockReqRes(
        "POST",
        `/api/cloud/agents/${agentId}/connect`,
      );

      mockCloudManager.getActiveAgentId.mockReturnValue("other-agent");
      mockCloudManager.connect.mockResolvedValue({
        agentName: "connected-agent",
      });

      const handled = await handleCloudRoute(
        req,
        res,
        `/api/cloud/agents/${agentId}/connect`,
        "POST",
        state,
      );
      expect(handled).toBe(true);

      const body = (await resBody) as { ok: boolean };
      expect(body.ok).toBe(true);
      expect(mockCloudManager.disconnect).toHaveBeenCalled();
      expect(mockCloudManager.connect).toHaveBeenCalledWith(agentId);
    });
  });

  describe("POST /api/cloud/disconnect", () => {
    it("disconnects successfully", async () => {
      const { req, res, resBody } = createMockReqRes(
        "POST",
        "/api/cloud/disconnect",
      );

      const handled = await handleCloudRoute(
        req,
        res,
        "/api/cloud/disconnect",
        "POST",
        state,
      );
      expect(handled).toBe(true);

      const body = (await resBody) as { ok: boolean };
      expect(body.ok).toBe(true);
      expect(mockCloudManager.disconnect).toHaveBeenCalled();
    });
  });
});
