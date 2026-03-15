import { describe, expect, it, vi, beforeEach } from "vitest";
import { syncPluginAction } from "../sync-plugin";
import { syncPlugin } from "../../services/plugin-eject";

vi.mock("../../services/plugin-eject", () => ({
  syncPlugin: vi.fn(),
}));

describe("syncPluginAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return true for validate", async () => {
    const result = await syncPluginAction.validate(
      {} as any,
      {} as any,
      {} as any,
    );
    expect(result).toBe(true);
  });

  it("should fail if pluginId parameter is missing", async () => {
    const options = { parameters: {} };

    const result = await syncPluginAction.handler(
      {} as any,
      {} as any,
      {} as any,
      options,
    );

    expect(result).toEqual({
      text: "I need a plugin ID to sync.",
      success: false,
    });
    expect(syncPlugin).not.toHaveBeenCalled();
  });

  it("should fail if pluginId parameter is empty string", async () => {
    const options = { parameters: { pluginId: "   " } };

    const result = await syncPluginAction.handler(
      {} as any,
      {} as any,
      {} as any,
      options,
    );

    expect(result).toEqual({
      text: "I need a plugin ID to sync.",
      success: false,
    });
    expect(syncPlugin).not.toHaveBeenCalled();
  });

  it("should handle successful plugin sync", async () => {
    const options = { parameters: { pluginId: "discord" } };
    const mockResult = {
      success: true,
      pluginName: "discord",
      upstreamCommits: 2,
    };
    vi.mocked(syncPlugin).mockResolvedValue(mockResult as any);

    const result = await syncPluginAction.handler(
      {} as any,
      {} as any,
      {} as any,
      options,
    );

    expect(syncPlugin).toHaveBeenCalledWith("discord");
    expect(result).toEqual({
      text: "Synced discord (2 upstream commits).",
      success: true,
      data: { ...mockResult },
    });
  });

  it("should handle failed plugin sync with specific error and no conflicts", async () => {
    const options = { parameters: { pluginId: "discord" } };
    const mockResult = {
      success: false,
      conflicts: [],
      error: "test error syncing",
    };
    vi.mocked(syncPlugin).mockResolvedValue(mockResult as any);

    const result = await syncPluginAction.handler(
      {} as any,
      {} as any,
      {} as any,
      options,
    );

    expect(syncPlugin).toHaveBeenCalledWith("discord");
    expect(result).toEqual({
      text: "Failed to sync discord: test error syncing.",
      success: false,
      data: { ...mockResult },
    });
  });

  it("should handle failed plugin sync with unknown error", async () => {
    const options = { parameters: { pluginId: "discord" } };
    const mockResult = {
      success: false,
      conflicts: [],
    };
    vi.mocked(syncPlugin).mockResolvedValue(mockResult as any);

    const result = await syncPluginAction.handler(
      {} as any,
      {} as any,
      {} as any,
      options,
    );

    expect(syncPlugin).toHaveBeenCalledWith("discord");
    expect(result).toEqual({
      text: "Failed to sync discord: unknown error.",
      success: false,
      data: { ...mockResult },
    });
  });

  it("should handle failed plugin sync with conflicts", async () => {
    const options = { parameters: { pluginId: "discord" } };
    const mockResult = {
      success: false,
      conflicts: ["file1.txt", "file2.txt"],
      error: "merge conflict",
    };
    vi.mocked(syncPlugin).mockResolvedValue(mockResult as any);

    const result = await syncPluginAction.handler(
      {} as any,
      {} as any,
      {} as any,
      options,
    );

    expect(syncPlugin).toHaveBeenCalledWith("discord");
    expect(result).toEqual({
      text: "Failed to sync discord: merge conflict. Conflicts: file1.txt, file2.txt",
      success: false,
      data: { ...mockResult },
    });
  });
});
