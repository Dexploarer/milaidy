import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { ejectCoreAction } from "../eject-core";
import { ejectCore } from "../../services/core-eject";
import { requestRestart } from "../../runtime/restart";

vi.mock("../../services/core-eject", () => ({
  ejectCore: vi.fn(),
}));

vi.mock("../../runtime/restart", () => ({
  requestRestart: vi.fn(),
}));

describe("ejectCoreAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should return true for validate", async () => {
    const result = await ejectCoreAction.validate(
      {} as any,
      {} as any,
      {} as any,
    );
    expect(result).toBe(true);
  });

  it("should handle successful core ejection", async () => {
    const mockResult = {
      success: true,
      ejectedPath: "/test/path/core",
    };
    vi.mocked(ejectCore).mockResolvedValue(mockResult as any);

    const result = await ejectCoreAction.handler({} as any, {} as any, {} as any);

    expect(ejectCore).toHaveBeenCalled();
    expect(result).toEqual({
      text: "Ejected @elizaos/core to /test/path/core. Restarting to load local source.",
      success: true,
      data: { ...mockResult },
    });

    // Verify requestRestart is called after timeout
    expect(requestRestart).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(requestRestart).toHaveBeenCalledWith("Core ejected");
  });

  it("should handle failed core ejection with specific error", async () => {
    const mockResult = {
      success: false,
      error: "test error from git",
    };
    vi.mocked(ejectCore).mockResolvedValue(mockResult as any);

    const result = await ejectCoreAction.handler({} as any, {} as any, {} as any);

    expect(ejectCore).toHaveBeenCalled();
    expect(result).toEqual({
      text: "Failed to eject @elizaos/core: test error from git",
      success: false,
    });

    vi.advanceTimersByTime(1000);
    expect(requestRestart).not.toHaveBeenCalled();
  });

  it("should handle failed core ejection with unknown error", async () => {
    const mockResult = {
      success: false,
    };
    vi.mocked(ejectCore).mockResolvedValue(mockResult as any);

    const result = await ejectCoreAction.handler({} as any, {} as any, {} as any);

    expect(ejectCore).toHaveBeenCalled();
    expect(result).toEqual({
      text: "Failed to eject @elizaos/core: unknown error",
      success: false,
    });

    vi.advanceTimersByTime(1000);
    expect(requestRestart).not.toHaveBeenCalled();
  });
});
