import http from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startApiServer } from "../src/api/server";

// Helper to make a request and get headers
function req(
  port: number,
  method: string,
  p: string,
): Promise<{
  status: number;
  headers: http.IncomingHttpHeaders;
}> {
  return new Promise((resolve, reject) => {
    const r = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: p,
        method,
      },
      (res) => {
        // Consume data to ensure response completes
        res.on("data", () => {});
        res.on("end", () => {
          resolve({ status: res.statusCode ?? 0, headers: res.headers });
        });
      },
    );
    r.on("error", reject);
    r.end();
  });
}

describe("API Security Headers E2E", () => {
  let port: number;
  let close: () => Promise<void>;

  beforeAll(async () => {
    const server = await startApiServer({ port: 0 });
    port = server.port;
    close = server.close;
  }, 30_000);

  afterAll(async () => {
    await close();
  });

  it("GET /api/status returns security headers", async () => {
    const { status, headers } = await req(port, "GET", "/api/status");
    expect(status).toBe(200);

    // Existing headers (regression check)
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["x-xss-protection"]).toBe("1; mode=block");
    expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");

    // New headers (to be implemented)
    expect(headers["permissions-policy"]).toBe(
      "accelerometer=(), camera=(self), geolocation=(), gyroscope=(), magnetometer=(), microphone=(self), payment=(), usb=()"
    );

    // Content-Security-Policy should be present and contain standard directives
    // We check for key directives to ensure it's not empty or malformed
    const csp = headers["content-security-policy"];
    expect(typeof csp).toBe("string");
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("style-src 'self'");
  });
});
