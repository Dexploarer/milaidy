import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { reinjectPluginAction } from "../reinject-plugin";
import { reinjectPlugin } from "../../services/plugin-eject";
import { requestRestart } from "../../runtime/restart";

vi.mock("../../services/plugin-eject", () => ({
  reinjectPlugin: vi.fn(),
}));

vi.mock("../../runtime/restart", () => ({
  requestRestart: vi.fn(),
}));

describe("reinjectPluginAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should return true for validate", async () => {
    const result = await reinjectPluginAction.validate(
      {} as any,
      {} as any,
      {} as any,
    );
    expect(result).toBe(true);
  });

  it("should fail if pluginId parameter is missing", async () => {
    const options = { parameters: {} };

    const result = await reinjectPluginAction.handler(
      {} as any,
      {} as any,
      {} as any,
      options,
    );

    expect(result).toEqual({
      text: "I need a plugin ID to reinject.",
      success: false,
    });
    expect(reinjectPlugin).not.toHaveBeenCalled();
  });

  it("should fail if pluginId parameter is empty string", async () => {
    const options = { parameters: { pluginId: "   " } };

    const result = await reinjectPluginAction.handler(
      {} as any,
      {} as any,
      {} as any,
      options,
    );

    expect(result).toEqual({
      text: "I need a plugin ID to reinject.",
      success: false,
    });
    expect(reinjectPlugin).not.toHaveBeenCalled();
  });

  it("should handle successful plugin reinjection", async () => {
    const options = { parameters: { pluginId: "discord" } };
    const mockResult = {
      success: true,
      pluginName: "discord",
      removedPath: "/test/path/discord",
    };
    vi.mocked(reinjectPlugin).mockResolvedValue(mockResult as any);

    const result = await reinjectPluginAction.handler(
      {} as any,
      {} as any,
      {} as any,
      options,
    );

    expect(reinjectPlugin).toHaveBeenCalledWith("discord");
    expect(result).toEqual({
      text: "Removed ejected plugin discord. Restarting to load npm version.",
      success: true,
      data: { ...mockResult },
    });

    expect(requestRestart).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(requestRestart).toHaveBeenCalledWith("Plugin discord reinjected");
  });

  it("should handle failed plugin reinjection with specific error", async () => {
    const options = { parameters: { pluginId: "discord" } };
    const mockResult = {
      success: false,
      error: "test error removing dir",
    };
    vi.mocked(reinjectPlugin).mockResolvedValue(mockResult as any);

    const result = await reinjectPluginAction.handler(
      {} as any,
      {} as any,
      {} as any,
      options,
    );

    expect(reinjectPlugin).toHaveBeenCalledWith("discord");
    expect(result).toEqual({
      text: "Failed to reinject discord: test error removing dir",
      success: false,
    });

    vi.advanceTimersByTime(1000);
    expect(requestRestart).not.toHaveBeenCalled();
  });

  it("should handle failed plugin reinjection with unknown error", async () => {
    const options = { parameters: { pluginId: "discord" } };
    const mockResult = {
      success: false,
    };
    vi.mocked(reinjectPlugin).mockResolvedValue(mockResult as any);

    const result = await reinjectPluginAction.handler(
      {} as any,
      {} as any,
      {} as any,
      options,
    );

    expect(reinjectPlugin).toHaveBeenCalledWith("discord");
    expect(result).toEqual({
      text: "Failed to reinject discord: unknown error",
      success: false,
    });

    vi.advanceTimersByTime(1000);
    expect(requestRestart).not.toHaveBeenCalled();
  });
});
