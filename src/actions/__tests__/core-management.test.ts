import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { requestRestart } from "../../runtime/restart";
import {
  ejectCore,
  getCoreStatus,
  reinjectCore,
  syncCore,
} from "../../services/core-eject";
import { coreStatusAction } from "../core-status";
import { ejectCoreAction } from "../eject-core";
import { reinjectCoreAction } from "../reinject-core";
import { syncCoreAction } from "../sync-core";

vi.mock("../../services/core-eject", () => ({
  getCoreStatus: vi.fn(),
  ejectCore: vi.fn(),
  reinjectCore: vi.fn(),
  syncCore: vi.fn(),
}));

vi.mock("../../runtime/restart", () => ({
  requestRestart: vi.fn(),
}));

describe("core management actions", () => {
  const mockGetCoreStatus = vi.mocked(getCoreStatus);
  const mockEjectCore = vi.mocked(ejectCore);
  const mockReinjectCore = vi.mocked(reinjectCore);
  const mockSyncCore = vi.mocked(syncCore);
  const mockRequestRestart = vi.mocked(requestRestart);

  beforeEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("coreStatusAction", () => {
    it("returns status for npm @elizaos/core", async () => {
      mockGetCoreStatus.mockResolvedValue({
        ejected: false,
        version: "0.1.0",
        coreDistPath: "/node_modules/@elizaos/core",
        commitHash: null,
      });

      const result = await coreStatusAction.handler(
        undefined as unknown,
        { roomId: "room", content: { text: "" } },
        undefined,
        undefined,
      );

      expect(result.success).toBe(true);
      expect(result.text).toBe("Using npm @elizaos/core v0.1.0.");
    });

    it("returns status for ejected @elizaos/core", async () => {
      mockGetCoreStatus.mockResolvedValue({
        ejected: true,
        version: "0.2.0",
        coreDistPath: "/tmp/ejected",
        commitHash: "abcdef1234567890",
      });

      const result = await coreStatusAction.handler(
        undefined as unknown,
        { roomId: "room", content: { text: "" } },
        undefined,
        undefined,
      );

      expect(result.success).toBe(true);
      expect(result.text).toBe(
        "Using ejected @elizaos/core v0.2.0 at /tmp/ejected (commit abcdef123456).",
      );
    });

    it("returns status for ejected @elizaos/core without commitHash", async () => {
      mockGetCoreStatus.mockResolvedValue({
        ejected: true,
        version: "0.2.0",
        coreDistPath: "/tmp/ejected",
        commitHash: null,
      });

      const result = await coreStatusAction.handler(
        undefined as unknown,
        { roomId: "room", content: { text: "" } },
        undefined,
        undefined,
      );

      expect(result.success).toBe(true);
      expect(result.text).toBe(
        "Using ejected @elizaos/core v0.2.0 at /tmp/ejected (commit unknown).",
      );
    });
  });

  describe("ejectCoreAction", () => {
    it("returns failure when ejecting fails", async () => {
      mockEjectCore.mockResolvedValue({
        success: false,
        error: "network error",
      });

      const result = await ejectCoreAction.handler(
        undefined as unknown,
        { roomId: "room", content: { text: "" } },
        undefined,
        undefined,
      );

      expect(result.success).toBe(false);
      expect(result.text).toBe("Failed to eject @elizaos/core: network error");
      expect(mockRequestRestart).not.toHaveBeenCalled();
    });

    it("schedules restart on successful eject", async () => {
      vi.useFakeTimers();
      mockEjectCore.mockResolvedValue({
        success: true,
        ejectedPath: "/tmp/core",
      });

      const result = await ejectCoreAction.handler(
        undefined as unknown,
        { roomId: "room", content: { text: "" } },
        undefined,
        undefined,
      );

      expect(result.success).toBe(true);
      expect(result.text).toBe(
        "Ejected @elizaos/core to /tmp/core. Restarting to load local source.",
      );
      expect(mockRequestRestart).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1100);
      expect(mockRequestRestart).toHaveBeenCalledWith("Core ejected");
    });
  });

  describe("reinjectCoreAction", () => {
    it("returns failure when reinject fails", async () => {
      mockReinjectCore.mockResolvedValue({
        success: false,
        error: "not ejected",
      });

      const result = await reinjectCoreAction.handler(
        undefined as unknown,
        { roomId: "room", content: { text: "" } },
        undefined,
        undefined,
      );

      expect(result.success).toBe(false);
      expect(result.text).toBe("Failed to reinject @elizaos/core: not ejected");
      expect(mockRequestRestart).not.toHaveBeenCalled();
    });

    it("schedules restart on successful reinject", async () => {
      vi.useFakeTimers();
      mockReinjectCore.mockResolvedValue({
        success: true,
        removedPath: "/tmp/core",
      });

      const result = await reinjectCoreAction.handler(
        undefined as unknown,
        { roomId: "room", content: { text: "" } },
        undefined,
        undefined,
      );

      expect(result.success).toBe(true);
      expect(result.text).toBe(
        "Removed ejected @elizaos/core. Restarting to load npm version.",
      );
      expect(mockRequestRestart).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1100);
      expect(mockRequestRestart).toHaveBeenCalledWith("Core reinjected");
    });
  });

  describe("syncCoreAction", () => {
    it("returns success with upstream commits", async () => {
      mockSyncCore.mockResolvedValue({
        success: true,
        upstreamCommits: 5,
        localChanges: false,
        commitHash: "abc",
        upstreamVersion: "1.0",
        conflicts: [],
      });

      const result = await syncCoreAction.handler(
        undefined as unknown,
        { roomId: "room", content: { text: "" } },
        undefined,
        undefined,
      );

      expect(result.success).toBe(true);
      expect(result.text).toBe("Synced @elizaos/core (5 upstream commits).");
    });

    it("returns failure without conflicts", async () => {
      mockSyncCore.mockResolvedValue({
        success: false,
        error: "git error",
        conflicts: [],
      });

      const result = await syncCoreAction.handler(
        undefined as unknown,
        { roomId: "room", content: { text: "" } },
        undefined,
        undefined,
      );

      expect(result.success).toBe(false);
      expect(result.text).toBe("Failed to sync @elizaos/core: git error.");
    });

    it("returns failure with conflicts", async () => {
      mockSyncCore.mockResolvedValue({
        success: false,
        error: "merge failed",
        conflicts: ["file1.ts", "file2.ts"],
      });

      const result = await syncCoreAction.handler(
        undefined as unknown,
        { roomId: "room", content: { text: "" } },
        undefined,
        undefined,
      );

      expect(result.success).toBe(false);
      expect(result.text).toBe(
        "Failed to sync @elizaos/core: merge failed. Conflicts: file1.ts, file2.ts",
      );
    });
  });
});
