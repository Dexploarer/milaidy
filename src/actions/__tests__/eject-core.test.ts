import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { ejectCoreAction } from "../eject-core";
import { requestRestart } from "../../runtime/restart";
import { ejectCore } from "../../services/core-eject";

vi.mock("../../runtime/restart", () => ({
  requestRestart: vi.fn(),
}));

vi.mock("../../services/core-eject", () => ({
  ejectCore: vi.fn(),
}));

describe("ejectCoreAction", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should validate to true", async () => {
    expect(
      await ejectCoreAction.validate({} as any, {} as any, {} as any),
    ).toBe(true);
  });

  it("should handle failed ejection with explicit error", async () => {
    vi.mocked(ejectCore).mockResolvedValue({
      success: false,
      error: "Git not found",
    });

    const result = await ejectCoreAction.handler(
      {} as any,
      {} as any,
      {} as any,
    );

    expect(result).toEqual({
      text: "Failed to eject @elizaos/core: Git not found",
      success: false,
    });
    expect(requestRestart).not.toHaveBeenCalled();
  });

  it("should handle failed ejection with default error", async () => {
    vi.mocked(ejectCore).mockResolvedValue({
      success: false,
    });

    const result = await ejectCoreAction.handler(
      {} as any,
      {} as any,
      {} as any,
    );

    expect(result).toEqual({
      text: "Failed to eject @elizaos/core: unknown error",
      success: false,
    });
    expect(requestRestart).not.toHaveBeenCalled();
  });

  it("should handle successful ejection and request restart", async () => {
    vi.mocked(ejectCore).mockResolvedValue({
      success: true,
      ejectedPath: "/path/to/ejected",
    });

    const result = await ejectCoreAction.handler(
      {} as any,
      {} as any,
      {} as any,
    );

    expect(result).toEqual({
      text: "Ejected @elizaos/core to /path/to/ejected. Restarting to load local source.",
      success: true,
      data: {
        success: true,
        ejectedPath: "/path/to/ejected",
      },
    });

    expect(requestRestart).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1000);

    expect(requestRestart).toHaveBeenCalledTimes(1);
    expect(requestRestart).toHaveBeenCalledWith("Core ejected");
  });
});
