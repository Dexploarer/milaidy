import { describe, expect, it, vi, beforeEach } from "vitest";
import { coreStatusAction } from "../core-status";

const mockGetCoreStatus = vi.fn();

vi.mock("../../services/core-eject", () => ({
  getCoreStatus: () => mockGetCoreStatus(),
}));

describe("coreStatusAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should have correct basic properties", () => {
    expect(coreStatusAction.name).toBe("CORE_STATUS");
    expect(coreStatusAction.similes).toEqual([
      "CHECK_CORE_STATUS",
      "SHOW_CORE_STATUS",
      "CORE_EJECT_STATUS",
    ]);
    expect(coreStatusAction.description).toBe(
      "Show whether @elizaos/core is running from npm or ejected source.",
    );
  });

  it("should always validate", async () => {
    const result = await coreStatusAction.validate(
      // @ts-expect-error - mock for Action validation
      {},
      {},
      {},
    );
    expect(result).toBe(true);
  });

  it("should handle npm (unejected) core status", async () => {
    const mockStatus = {
      ejected: false,
      version: "0.1.0",
      npmVersion: "0.1.0",
    };
    mockGetCoreStatus.mockResolvedValue(mockStatus);

    const result = await coreStatusAction.handler(
      // @ts-expect-error - mock for Action handler
      {},
      {},
      {},
    );

    expect(result).toEqual({
      text: "Using npm @elizaos/core v0.1.0.",
      success: true,
      data: mockStatus,
    });
  });

  it("should handle ejected core status with commit hash", async () => {
    const mockStatus = {
      ejected: true,
      version: "0.1.0",
      npmVersion: "0.1.0",
      commitHash: "12345678901234567890",
      coreDistPath: "/path/to/dist",
    };
    mockGetCoreStatus.mockResolvedValue(mockStatus);

    const result = await coreStatusAction.handler(
      // @ts-expect-error - mock for Action handler
      {},
      {},
      {},
    );

    expect(result).toEqual({
      text: "Using ejected @elizaos/core v0.1.0 at /path/to/dist (commit 123456789012).",
      success: true,
      data: mockStatus,
    });
  });

  it("should handle ejected core status without commit hash", async () => {
    const mockStatus = {
      ejected: true,
      version: "0.1.0",
      npmVersion: "0.1.0",
      commitHash: null,
      coreDistPath: "/path/to/dist",
    };
    mockGetCoreStatus.mockResolvedValue(mockStatus);

    const result = await coreStatusAction.handler(
      // @ts-expect-error - mock for Action handler
      {},
      {},
      {},
    );

    expect(result).toEqual({
      text: "Using ejected @elizaos/core v0.1.0 at /path/to/dist (commit unknown).",
      success: true,
      data: mockStatus,
    });
  });
});
