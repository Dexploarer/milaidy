import { describe, expect, it, vi, beforeEach } from "vitest";
import { listEjectedAction } from "../list-ejected";
import { listEjectedPlugins } from "../../services/plugin-eject";

vi.mock("../../services/plugin-eject", () => ({
  listEjectedPlugins: vi.fn(),
}));

describe("listEjectedAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return true for validate", async () => {
    const result = await listEjectedAction.validate(
      {} as any,
      {} as any,
      {} as any,
    );
    expect(result).toBe(true);
  });

  it("should handle empty list of ejected plugins", async () => {
    vi.mocked(listEjectedPlugins).mockResolvedValue([]);

    const result = await listEjectedAction.handler(
      {} as any,
      {} as any,
      {} as any,
    );

    expect(listEjectedPlugins).toHaveBeenCalled();
    expect(result).toEqual({
      text: "No ejected plugins found.",
      success: true,
      data: { count: 0, plugins: [] },
    });
  });

  it("should correctly format list of ejected plugins", async () => {
    const mockPlugins = [
      { name: "p1", path: "/test/p1" },
      { name: "p2", path: "/test/p2", upstream: { branch: "main" } },
    ];
    vi.mocked(listEjectedPlugins).mockResolvedValue(mockPlugins as any);

    const result = await listEjectedAction.handler(
      {} as any,
      {} as any,
      {} as any,
    );

    expect(listEjectedPlugins).toHaveBeenCalled();
    expect(result).toEqual({
      text: "Ejected plugins (2):\n- p1 (/test/p1)\n- p2@main (/test/p2)",
      success: true,
      data: { count: 2, plugins: mockPlugins },
    });
  });
});
