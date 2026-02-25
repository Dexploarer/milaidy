import { describe, expect, it } from "vitest";
import { resolveWebSurfaceMode } from "./server";

describe("resolveWebSurfaceMode", () => {
  it("defaults to dashboard for unset values", () => {
    expect(resolveWebSurfaceMode(undefined)).toBe("dashboard");
    expect(resolveWebSurfaceMode("")).toBe("dashboard");
  });

  it("accepts landing aliases", () => {
    expect(resolveWebSurfaceMode("landing")).toBe("landing");
    expect(resolveWebSurfaceMode("LANDING")).toBe("landing");
    expect(resolveWebSurfaceMode("marketing")).toBe("landing");
  });

  it("falls back to dashboard for unknown values", () => {
    expect(resolveWebSurfaceMode("dashboard")).toBe("dashboard");
    expect(resolveWebSurfaceMode("something-else")).toBe("dashboard");
  });
});
