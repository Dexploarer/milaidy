import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleSandboxRoute } from "./sandbox-routes";
import { IncomingMessage, ServerResponse } from "node:http";
import type { SandboxManager } from "../services/sandbox-manager";
import * as httpHelpers from "./http-helpers";

vi.mock("./http-helpers", async () => {
  const actual = await vi.importActual("./http-helpers");
  return {
    ...actual as any,
    sendJson: vi.fn(),
    readJsonBody: vi.fn(),
  };
});

describe("sandbox-routes", () => {
  let req: Partial<IncomingMessage>;
  let res: Partial<ServerResponse>;
  let mockSandboxManager: Partial<SandboxManager>;
  let state: any;

  beforeEach(() => {
    vi.clearAllMocks();

    req = {
      method: "GET",
      url: "/api/sandbox/status",
      headers: {},
      on: vi.fn(),
    } as unknown as Partial<IncomingMessage>;

    res = {} as unknown as Partial<ServerResponse>;

    mockSandboxManager = {
      getStatus: vi.fn().mockReturnValue({ state: "running" }),
      getEventLog: vi.fn().mockReturnValue([]),
      start: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue(undefined),
      recover: vi.fn().mockResolvedValue(undefined),
      exec: vi.fn().mockResolvedValue({ exitCode: 0, stdout: "ok", stderr: "" }),
      getBrowserCdpEndpoint: vi.fn().mockReturnValue("cdp-url"),
      getBrowserWsEndpoint: vi.fn().mockReturnValue("ws-url"),
      getCapabilities: vi.fn().mockReturnValue({ docker: true }),
    };

    state = { sandboxManager: mockSandboxManager };
  });

  it("should return false for non-sandbox routes", async () => {
    const result = await handleSandboxRoute(req as IncomingMessage, res as ServerResponse, "/api/other", "GET", state);
    expect(result).toBe(false);
  });

  it("should return 503 if sandbox manager is not initialized", async () => {
    state.sandboxManager = null;
    const result = await handleSandboxRoute(req as IncomingMessage, res as ServerResponse, "/api/sandbox/status", "GET", state);
    expect(result).toBe(true);
    expect(httpHelpers.sendJson).toHaveBeenCalledWith(res, { error: "Sandbox manager not initialized" }, 503);
  });

  it("should handle GET /api/sandbox/status", async () => {
    const result = await handleSandboxRoute(req as IncomingMessage, res as ServerResponse, "/api/sandbox/status", "GET", state);
    expect(result).toBe(true);
    expect(httpHelpers.sendJson).toHaveBeenCalledWith(res, { state: "running" }, 200);
  });

  it("should handle POST /api/sandbox/start successfully", async () => {
    const result = await handleSandboxRoute(req as IncomingMessage, res as ServerResponse, "/api/sandbox/start", "POST", state);
    expect(result).toBe(true);
    expect(httpHelpers.sendJson).toHaveBeenCalledWith(res, { state: "running" }, 200);
    expect(mockSandboxManager.start).toHaveBeenCalled();
  });

  it("should handle POST /api/sandbox/start failure", async () => {
    mockSandboxManager.start = vi.fn().mockRejectedValue(new Error("Start failed"));
    const result = await handleSandboxRoute(req as IncomingMessage, res as ServerResponse, "/api/sandbox/start", "POST", state);
    expect(result).toBe(true);
    expect(httpHelpers.sendJson).toHaveBeenCalledWith(res, { error: "Failed to start sandbox: Start failed" }, 500);
  });

  it("should handle POST /api/sandbox/stop", async () => {
    const result = await handleSandboxRoute(req as IncomingMessage, res as ServerResponse, "/api/sandbox/stop", "POST", state);
    expect(result).toBe(true);
    expect(httpHelpers.sendJson).toHaveBeenCalledWith(res, { state: "running" }, 200);
    expect(mockSandboxManager.stop).toHaveBeenCalled();
  });

  it("should handle POST /api/sandbox/recover", async () => {
    const result = await handleSandboxRoute(req as IncomingMessage, res as ServerResponse, "/api/sandbox/recover", "POST", state);
    expect(result).toBe(true);
    expect(httpHelpers.sendJson).toHaveBeenCalledWith(res, { state: "running" }, 200);
    expect(mockSandboxManager.recover).toHaveBeenCalled();
  });

  it("should handle GET /api/sandbox/platform", async () => {
    const result = await handleSandboxRoute(req as IncomingMessage, res as ServerResponse, "/api/sandbox/platform", "GET", state);
    expect(result).toBe(true);
    expect(httpHelpers.sendJson).toHaveBeenCalledWith(res, expect.any(Object), 200);
  });

  it("should handle GET /api/sandbox/events", async () => {
    mockSandboxManager.getEventLog = vi.fn().mockReturnValue([{ type: "test" }]);
    const result = await handleSandboxRoute(req as IncomingMessage, res as ServerResponse, "/api/sandbox/events", "GET", state);
    expect(result).toBe(true);
    expect(httpHelpers.sendJson).toHaveBeenCalledWith(res, { events: [{ type: "test" }] }, 200);
  });

  it("should handle POST /api/sandbox/exec successfully", async () => {
    vi.mocked(httpHelpers.readJsonBody).mockResolvedValue({ command: "ls" });
    const result = await handleSandboxRoute(req as IncomingMessage, res as ServerResponse, "/api/sandbox/exec", "POST", state);
    expect(result).toBe(true);
    expect(mockSandboxManager.exec).toHaveBeenCalledWith({ command: "ls", workdir: undefined, timeoutMs: undefined });
    expect(httpHelpers.sendJson).toHaveBeenCalledWith(res, { exitCode: 0, stdout: "ok", stderr: "" }, 200);
  });

  it("should handle GET /api/sandbox/capabilities", async () => {
    const result = await handleSandboxRoute(req as IncomingMessage, res as ServerResponse, "/api/sandbox/capabilities", "GET", state);
    expect(result).toBe(true);
    expect(httpHelpers.sendJson).toHaveBeenCalledWith(res, expect.any(Object), 200);
  });

  it("should handle GET /api/sandbox/browser", async () => {
    const result = await handleSandboxRoute(req as IncomingMessage, res as ServerResponse, "/api/sandbox/browser", "GET", state);
    expect(result).toBe(true);
    expect(httpHelpers.sendJson).toHaveBeenCalledWith(res, { cdpEndpoint: "cdp-url", wsEndpoint: "ws-url" }, 200);
    expect(mockSandboxManager.getBrowserCdpEndpoint).toHaveBeenCalled();
    expect(mockSandboxManager.getBrowserWsEndpoint).toHaveBeenCalled();
  });

  it("should handle POST /api/sandbox/docker/start successfully", async () => {
    const result = await handleSandboxRoute(req as IncomingMessage, res as ServerResponse, "/api/sandbox/docker/start", "POST", state);
    expect(result).toBe(true);
    expect(httpHelpers.sendJson).toHaveBeenCalledWith(res, expect.any(Object), 200);
  });

  it("should handle fallthrough route", async () => {
    const result = await handleSandboxRoute(req as IncomingMessage, res as ServerResponse, "/api/sandbox/unknown", "GET", state);
    expect(result).toBe(true);
    expect(httpHelpers.sendJson).toHaveBeenCalledWith(res, { error: "Unknown sandbox route: GET /api/sandbox/unknown" }, 404);
  });
});
