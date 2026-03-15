import { describe, expect, it, vi, beforeEach } from "vitest";
import { syncCoreAction } from "../sync-core";
import { syncCore } from "../../services/core-eject";

vi.mock("../../services/core-eject", () => ({
  syncCore: vi.fn(),
}));

describe("syncCoreAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return true for validate", async () => {
    const result = await syncCoreAction.validate(
      {} as any,
      {} as any,
      {} as any,
    );
    expect(result).toBe(true);
  });

  it("should handle successful core sync", async () => {
    const mockResult = {
      success: true,
      upstreamCommits: 2,
    };
    vi.mocked(syncCore).mockResolvedValue(mockResult as any);

    const result = await syncCoreAction.handler({} as any, {} as any, {} as any);

    expect(syncCore).toHaveBeenCalled();
    expect(result).toEqual({
      text: "Synced @elizaos/core (2 upstream commits).",
      success: true,
      data: { ...mockResult },
    });
  });

  it("should handle failed core sync with specific error and no conflicts", async () => {
    const mockResult = {
      success: false,
      conflicts: [],
      error: "test error syncing",
    };
    vi.mocked(syncCore).mockResolvedValue(mockResult as any);

    const result = await syncCoreAction.handler({} as any, {} as any, {} as any);

    expect(syncCore).toHaveBeenCalled();
    expect(result).toEqual({
      text: "Failed to sync @elizaos/core: test error syncing.",
      success: false,
      data: { ...mockResult },
    });
  });

  it("should handle failed core sync with unknown error", async () => {
    const mockResult = {
      success: false,
      conflicts: [],
    };
    vi.mocked(syncCore).mockResolvedValue(mockResult as any);

    const result = await syncCoreAction.handler({} as any, {} as any, {} as any);

    expect(syncCore).toHaveBeenCalled();
    expect(result).toEqual({
      text: "Failed to sync @elizaos/core: unknown error.",
      success: false,
      data: { ...mockResult },
    });
  });

  it("should handle failed core sync with conflicts", async () => {
    const mockResult = {
      success: false,
      conflicts: ["file1.txt", "file2.txt"],
      error: "merge conflict",
    };
    vi.mocked(syncCore).mockResolvedValue(mockResult as any);

    const result = await syncCoreAction.handler({} as any, {} as any, {} as any);

    expect(syncCore).toHaveBeenCalled();
    expect(result).toEqual({
      text: "Failed to sync @elizaos/core: merge conflict. Conflicts: file1.txt, file2.txt",
      success: false,
      data: { ...mockResult },
    });
  });
});
