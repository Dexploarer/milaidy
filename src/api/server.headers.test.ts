import type http from "node:http";
import { describe, expect, it, vi } from "vitest";
import { applySecurityHeaders } from "./server";

describe("applySecurityHeaders", () => {
  it("sets security headers", () => {
    const res = {
      setHeader: vi.fn(),
    } as unknown as http.ServerResponse;

    applySecurityHeaders(res);

    expect(res.setHeader).toHaveBeenCalledWith("X-Content-Type-Options", "nosniff");
    expect(res.setHeader).toHaveBeenCalledWith("X-Frame-Options", "DENY");
    expect(res.setHeader).toHaveBeenCalledWith("Referrer-Policy", "no-referrer");
    expect(res.setHeader).toHaveBeenCalledWith("Permissions-Policy", "interest-cohort=()");
  });
});
