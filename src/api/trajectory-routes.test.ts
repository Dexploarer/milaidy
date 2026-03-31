import type http from "node:http";
import type { AgentRuntime } from "@elizaos/core";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { handleTrajectoryRoute } from "./trajectory-routes";
import * as httpHelpers from "./http-helpers";

vi.mock("./http-helpers", () => ({
  readJsonBody: vi.fn(),
  sendJson: vi.fn(),
  sendJsonError: vi.fn(),
}));

vi.mock("./zip-utils", () => ({
  createZipArchive: vi.fn().mockReturnValue(Buffer.from("fake-zip")),
}));

describe("Trajectory Routes", () => {
  let mockReq: Partial<http.IncomingMessage>;
  let mockRes: Partial<http.ServerResponse>;
  let mockLogger: any;
  let mockRuntime: Partial<AgentRuntime>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockReq = {
      url: "/api/trajectories",
      headers: { host: "localhost" },
    };

    mockRes = {
      statusCode: 200,
      setHeader: vi.fn(),
      end: vi.fn(),
    };

    mockLogger = {
      isEnabled: vi.fn().mockReturnValue(true),
      setEnabled: vi.fn(),
      listTrajectories: vi.fn().mockResolvedValue({
        trajectories: [
          { id: "traj-1", agentId: "agent-1", status: "completed", startTime: 1000, llmCallCount: 0, totalPromptTokens: 0, totalCompletionTokens: 0, createdAt: "2023-01-01" },
        ],
        total: 1,
        offset: 0,
        limit: 50,
      }),
      getTrajectoryDetail: vi.fn().mockResolvedValue({
        trajectoryId: "traj-1",
        agentId: "agent-1",
        startTime: 1000,
        metrics: { finalStatus: "completed" },
        steps: [],
      }),
      getStats: vi.fn().mockResolvedValue({ total: 10 }),
      deleteTrajectories: vi.fn().mockResolvedValue(1),
      clearAllTrajectories: vi.fn().mockResolvedValue(5),
      exportTrajectories: vi.fn().mockResolvedValue({
        filename: "export.json",
        data: "[]",
        mimeType: "application/json",
      }),
      exportTrajectoriesZip: vi.fn().mockResolvedValue({
        filename: "export.zip",
        entries: [{ name: "traj-1.json", data: "{}" }],
      }),
    };

    mockRuntime = {
      getService: vi.fn().mockReturnValue(mockLogger),
      getServicesByType: vi.fn().mockReturnValue([mockLogger]),
    };
  });

  it("ignores non-trajectory routes", async () => {
    const result = await handleTrajectoryRoute(mockReq as any, mockRes as any, mockRuntime as any, "/api/other", "GET");
    expect(result).toBe(false);
  });

  it("handles missing logger gracefully", async () => {
    mockRuntime.getService = vi.fn().mockReturnValue(null);
    mockRuntime.getServicesByType = vi.fn().mockReturnValue([]);

    const result = await handleTrajectoryRoute(mockReq as any, mockRes as any, mockRuntime as any, "/api/trajectories/config", "GET");
    expect(result).toBe(true);
    expect(httpHelpers.sendJsonError).toHaveBeenCalledWith(mockRes, "Trajectory logger service not available", 503);
  });

  it("GET /api/trajectories/config", async () => {
    const result = await handleTrajectoryRoute(mockReq as any, mockRes as any, mockRuntime as any, "/api/trajectories/config", "GET");
    expect(result).toBe(true);
    expect(httpHelpers.sendJson).toHaveBeenCalledWith(mockRes, { enabled: true });
  });

  it("PUT /api/trajectories/config", async () => {
    vi.mocked(httpHelpers.readJsonBody).mockResolvedValueOnce({ enabled: false });
    const result = await handleTrajectoryRoute(mockReq as any, mockRes as any, mockRuntime as any, "/api/trajectories/config", "PUT");
    expect(result).toBe(true);
    expect(mockLogger.setEnabled).toHaveBeenCalledWith(false);
    expect(httpHelpers.sendJson).toHaveBeenCalledWith(mockRes, { enabled: true });
  });

  it("GET /api/trajectories", async () => {
    const result = await handleTrajectoryRoute(mockReq as any, mockRes as any, mockRuntime as any, "/api/trajectories", "GET");
    expect(result).toBe(true);
    expect(mockLogger.listTrajectories).toHaveBeenCalledWith(expect.objectContaining({ limit: 50, offset: 0 }));
    expect(httpHelpers.sendJson).toHaveBeenCalled();
  });

  it("GET /api/trajectories/stats", async () => {
    const result = await handleTrajectoryRoute(mockReq as any, mockRes as any, mockRuntime as any, "/api/trajectories/stats", "GET");
    expect(result).toBe(true);
    expect(mockLogger.getStats).toHaveBeenCalled();
    expect(httpHelpers.sendJson).toHaveBeenCalledWith(mockRes, { total: 10 });
  });

  it("GET /api/trajectories/:id", async () => {
    const result = await handleTrajectoryRoute(mockReq as any, mockRes as any, mockRuntime as any, "/api/trajectories/traj-1", "GET");
    expect(result).toBe(true);
    expect(mockLogger.getTrajectoryDetail).toHaveBeenCalledWith("traj-1");
    expect(httpHelpers.sendJson).toHaveBeenCalled();
  });

  it("DELETE /api/trajectories with all=true", async () => {
    vi.mocked(httpHelpers.readJsonBody).mockResolvedValueOnce({ all: true });
    const result = await handleTrajectoryRoute(mockReq as any, mockRes as any, mockRuntime as any, "/api/trajectories", "DELETE");
    expect(result).toBe(true);
    expect(mockLogger.clearAllTrajectories).toHaveBeenCalled();
    expect(httpHelpers.sendJson).toHaveBeenCalledWith(mockRes, { deleted: 5 });
  });

  it("DELETE /api/trajectories with trajectoryIds", async () => {
    vi.mocked(httpHelpers.readJsonBody).mockResolvedValueOnce({ trajectoryIds: ["traj-1"] });
    const result = await handleTrajectoryRoute(mockReq as any, mockRes as any, mockRuntime as any, "/api/trajectories", "DELETE");
    expect(result).toBe(true);
    expect(mockLogger.deleteTrajectories).toHaveBeenCalledWith(["traj-1"]);
    expect(httpHelpers.sendJson).toHaveBeenCalledWith(mockRes, { deleted: 1 });
  });

  it("POST /api/trajectories/export with zip format", async () => {
    vi.mocked(httpHelpers.readJsonBody).mockResolvedValueOnce({ format: "zip" });
    const result = await handleTrajectoryRoute(mockReq as any, mockRes as any, mockRuntime as any, "/api/trajectories/export", "POST");
    expect(result).toBe(true);
    expect(mockLogger.exportTrajectoriesZip).toHaveBeenCalled();
    expect(mockRes.setHeader).toHaveBeenCalledWith("Content-Type", "application/zip");
    expect(mockRes.end).toHaveBeenCalled();
  });

  it("POST /api/trajectories/export with json format", async () => {
    vi.mocked(httpHelpers.readJsonBody).mockResolvedValueOnce({ format: "json" });
    const result = await handleTrajectoryRoute(mockReq as any, mockRes as any, mockRuntime as any, "/api/trajectories/export", "POST");
    expect(result).toBe(true);
    expect(mockLogger.exportTrajectories).toHaveBeenCalledWith(expect.objectContaining({ format: "json" }));
    expect(mockRes.setHeader).toHaveBeenCalledWith("Content-Type", "application/json");
    expect(mockRes.end).toHaveBeenCalledWith("[]");
  });
});
