import http from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startApiServer } from "../src/api/server";

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
        res.resume(); // consume body
        res.on("end", () => {
          resolve({ status: res.statusCode ?? 0, headers: res.headers });
        });
      },
    );
    r.on("error", reject);
    r.end();
  });
}

describe("API Security Headers", () => {
  let port: number;
  let close: () => Promise<void>;

  beforeAll(async () => {
    const server = await startApiServer({ port: 0 });
    port = server.port;
    close = server.close;
  });

  afterAll(async () => {
    await close();
  });

  it("GET /api/status includes security headers", async () => {
    const { status, headers } = await req(port, "GET", "/api/status");
    expect(status).toBe(200);

    // Existing headers
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["x-xss-protection"]).toBe("1; mode=block");
    expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");

    // New headers
    expect(headers["content-security-policy"]).toBe(
      "default-src 'none'; frame-ancestors 'none'; sandbox allow-scripts allow-same-origin;",
    );
    expect(headers["permissions-policy"]).toBe(
      "browsing-topics=(), interest-cohort=(), geolocation=(), camera=(), microphone=(), payment=()",
    );
  });
});
