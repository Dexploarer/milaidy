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

  it("should validate to true", async () => {
    expect(
      await coreStatusAction.validate({} as any, {} as any, {} as any),
    ).toBe(true);
  });

  it("should return npm status when not ejected", async () => {
    vi.mocked(getCoreStatus).mockResolvedValue({
      ejected: false,
      version: "1.0.0",
      coreDistPath: "/path/to/core",
      commitHash: null,
    });

    const result = await coreStatusAction.handler(
      {} as any,
      {} as any,
      {} as any,
    );

    expect(result).toEqual({
      text: "Using npm @elizaos/core v1.0.0.",
      success: true,
      data: {
        ejected: false,
        version: "1.0.0",
        coreDistPath: "/path/to/core",
        commitHash: null,
      },
    });
  });

  it("should return ejected status when ejected with commit hash", async () => {
    vi.mocked(getCoreStatus).mockResolvedValue({
      ejected: true,
      version: "1.0.0",
      coreDistPath: "/ejected/path/core",
      commitHash: "abcdef1234567890",
    });

    const result = await coreStatusAction.handler(
      {} as any,
      {} as any,
      {} as any,
    );

    expect(result).toEqual({
      text: "Using ejected @elizaos/core v1.0.0 at /ejected/path/core (commit abcdef123456).",
      success: true,
      data: {
        ejected: true,
        version: "1.0.0",
        coreDistPath: "/ejected/path/core",
        commitHash: "abcdef1234567890",
      },
    });
  });

  it("should return ejected status when ejected without commit hash", async () => {
    vi.mocked(getCoreStatus).mockResolvedValue({
      ejected: true,
      version: "1.0.0",
      coreDistPath: "/ejected/path/core",
      commitHash: null,
    });

    const result = await coreStatusAction.handler(
      {} as any,
      {} as any,
      {} as any,
    );

    expect(result).toEqual({
      text: "Using ejected @elizaos/core v1.0.0 at /ejected/path/core (commit unknown).",
      success: true,
      data: {
        ejected: true,
        version: "1.0.0",
        coreDistPath: "/ejected/path/core",
        commitHash: null,
      },
    });
  });
});
