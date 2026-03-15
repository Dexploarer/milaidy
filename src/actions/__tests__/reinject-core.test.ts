import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { reinjectCoreAction } from "../reinject-core";
import { reinjectCore } from "../../services/core-eject";
import { requestRestart } from "../../runtime/restart";

vi.mock("../../services/core-eject", () => ({
  reinjectCore: vi.fn(),
}));

vi.mock("../../runtime/restart", () => ({
  requestRestart: vi.fn(),
}));

describe("reinjectCoreAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should return true for validate", async () => {
    const result = await reinjectCoreAction.validate(
      {} as any,
      {} as any,
      {} as any,
    );
    expect(result).toBe(true);
  });

  it("should handle successful core reinjection", async () => {
    const mockResult = {
      success: true,
      removedPath: "/test/path/core",
    };
    vi.mocked(reinjectCore).mockResolvedValue(mockResult as any);

    const result = await reinjectCoreAction.handler(
      {} as any,
      {} as any,
      {} as any,
    );

    expect(reinjectCore).toHaveBeenCalled();
    expect(result).toEqual({
      text: "Removed ejected @elizaos/core. Restarting to load npm version.",
      success: true,
      data: { ...mockResult },
    });

    expect(requestRestart).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(requestRestart).toHaveBeenCalledWith("Core reinjected");
  });

  it("should handle failed core reinjection with specific error", async () => {
    const mockResult = {
      success: false,
      error: "test error removing dir",
    };
    vi.mocked(reinjectCore).mockResolvedValue(mockResult as any);

    const result = await reinjectCoreAction.handler(
      {} as any,
      {} as any,
      {} as any,
    );

    expect(reinjectCore).toHaveBeenCalled();
    expect(result).toEqual({
      text: "Failed to reinject @elizaos/core: test error removing dir",
      success: false,
    });

    vi.advanceTimersByTime(1000);
    expect(requestRestart).not.toHaveBeenCalled();
  });

  it("should handle failed core reinjection with unknown error", async () => {
    const mockResult = {
      success: false,
    };
    vi.mocked(reinjectCore).mockResolvedValue(mockResult as any);

    const result = await reinjectCoreAction.handler(
      {} as any,
      {} as any,
      {} as any,
    );

    expect(reinjectCore).toHaveBeenCalled();
    expect(result).toEqual({
      text: "Failed to reinject @elizaos/core: unknown error",
      success: false,
    });

    vi.advanceTimersByTime(1000);
    expect(requestRestart).not.toHaveBeenCalled();
  });
});
