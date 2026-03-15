import { describe, expect, it, vi, beforeEach } from "vitest";
import { coreStatusAction } from "../core-status";
import { getCoreStatus } from "../../services/core-eject";

vi.mock("../../services/core-eject", () => ({
  getCoreStatus: vi.fn(),
}));

describe("coreStatusAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return true for validate", async () => {
    const result = await coreStatusAction.validate(
      {} as any,
      {} as any,
      {} as any,
    );
    expect(result).toBe(true);
  });

  it("should return npm version text when not ejected", async () => {
    const mockStatus = {
      ejected: false,
      version: "1.0.0",
      npmVersion: "1.0.0",
    };
    vi.mocked(getCoreStatus).mockResolvedValue(mockStatus as any);

    const result = await coreStatusAction.handler({} as any, {} as any, {} as any);

    expect(getCoreStatus).toHaveBeenCalled();
    expect(result).toEqual({
      text: "Using npm @elizaos/core v1.0.0.",
      success: true,
      data: { ...mockStatus },
    });
  });

  it("should return ejected version text when ejected", async () => {
    const mockStatus = {
      ejected: true,
      version: "1.0.0",
      coreDistPath: "/fake/dist/path",
      commitHash: "abcdef1234567890",
    };
    vi.mocked(getCoreStatus).mockResolvedValue(mockStatus as any);

    const result = await coreStatusAction.handler({} as any, {} as any, {} as any);

    expect(getCoreStatus).toHaveBeenCalled();
    expect(result).toEqual({
      text: "Using ejected @elizaos/core v1.0.0 at /fake/dist/path (commit abcdef123456).",
      success: true,
      data: { ...mockStatus },
    });
  });

  it("should handle missing commitHash when ejected", async () => {
    const mockStatus = {
      ejected: true,
      version: "1.0.0",
      coreDistPath: "/fake/dist/path",
      commitHash: null,
    };
    vi.mocked(getCoreStatus).mockResolvedValue(mockStatus as any);

    const result = await coreStatusAction.handler({} as any, {} as any, {} as any);

    expect(getCoreStatus).toHaveBeenCalled();
    expect(result).toEqual({
      text: "Using ejected @elizaos/core v1.0.0 at /fake/dist/path (commit unknown).",
      success: true,
      data: { ...mockStatus },
    });
  });
});
