import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { ejectPluginAction } from "../eject-plugin";
import { ejectPlugin } from "../../services/plugin-eject";
import { requestRestart } from "../../runtime/restart";

vi.mock("../../services/plugin-eject", () => ({
  ejectPlugin: vi.fn(),
}));

vi.mock("../../runtime/restart", () => ({
  requestRestart: vi.fn(),
}));

describe("ejectPluginAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should return true for validate", async () => {
    const result = await ejectPluginAction.validate(
      {} as any,
      {} as any,
      {} as any,
    );
    expect(result).toBe(true);
  });

  it("should fail if pluginId parameter is missing", async () => {
    const options = { parameters: {} };

    const result = await ejectPluginAction.handler(
      {} as any,
      {} as any,
      {} as any,
      options,
    );

    expect(result).toEqual({
      text: "I need a plugin ID to eject.",
      success: false,
    });
    expect(ejectPlugin).not.toHaveBeenCalled();
  });

  it("should fail if pluginId parameter is empty string", async () => {
    const options = { parameters: { pluginId: "   " } };

    const result = await ejectPluginAction.handler(
      {} as any,
      {} as any,
      {} as any,
      options,
    );

    expect(result).toEqual({
      text: "I need a plugin ID to eject.",
      success: false,
    });
    expect(ejectPlugin).not.toHaveBeenCalled();
  });

  it("should handle successful plugin ejection", async () => {
    const options = { parameters: { pluginId: "discord" } };
    const mockResult = {
      success: true,
      pluginName: "discord",
      ejectedPath: "/test/path/discord",
    };
    vi.mocked(ejectPlugin).mockResolvedValue(mockResult as any);

    const result = await ejectPluginAction.handler(
      {} as any,
      {} as any,
      {} as any,
      options,
    );

    expect(ejectPlugin).toHaveBeenCalledWith("discord");
    expect(result).toEqual({
      text: "Ejected discord to /test/path/discord. Restarting to load local source.",
      success: true,
      data: { ...mockResult },
    });

    expect(requestRestart).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(requestRestart).toHaveBeenCalledWith("Plugin discord ejected");
  });

  it("should handle failed plugin ejection with specific error", async () => {
    const options = { parameters: { pluginId: "discord" } };
    const mockResult = {
      success: false,
      error: "test error from git",
    };
    vi.mocked(ejectPlugin).mockResolvedValue(mockResult as any);

    const result = await ejectPluginAction.handler(
      {} as any,
      {} as any,
      {} as any,
      options,
    );

    expect(ejectPlugin).toHaveBeenCalledWith("discord");
    expect(result).toEqual({
      text: "Failed to eject discord: test error from git",
      success: false,
    });

    vi.advanceTimersByTime(1000);
    expect(requestRestart).not.toHaveBeenCalled();
  });

  it("should handle failed plugin ejection with unknown error", async () => {
    const options = { parameters: { pluginId: "discord" } };
    const mockResult = {
      success: false,
    };
    vi.mocked(ejectPlugin).mockResolvedValue(mockResult as any);

    const result = await ejectPluginAction.handler(
      {} as any,
      {} as any,
      {} as any,
      options,
    );

    expect(ejectPlugin).toHaveBeenCalledWith("discord");
    expect(result).toEqual({
      text: "Failed to eject discord: unknown error",
      success: false,
    });

    vi.advanceTimersByTime(1000);
    expect(requestRestart).not.toHaveBeenCalled();
  });
});
