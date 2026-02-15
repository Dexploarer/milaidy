import http from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startApiServer } from "../src/api/server.js";

// Helper to make requests
function req(
  port: number,
  method: string,
  p: string,
): Promise<{
  status: number;
  headers: http.IncomingHttpHeaders;
  data: Record<string, unknown>;
}> {
  return new Promise((resolve, reject) => {
    const r = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: p,
        method,
        headers: { "Content-Type": "application/json" },
      },
      (res) => {
        const ch: Buffer[] = [];
        res.on("data", (c: Buffer) => ch.push(c));
        res.on("end", () => {
          const raw = Buffer.concat(ch).toString("utf-8");
          let data: Record<string, unknown> = {};
          try {
            data = JSON.parse(raw);
          } catch {
            data = { _raw: raw };
          }
          resolve({ status: res.statusCode ?? 0, headers: res.headers, data });
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
    const { headers } = await req(port, "GET", "/api/status");

    expect(headers["content-security-policy"]).toBe("default-src 'none'");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["referrer-policy"]).toBe("no-referrer");
    expect(headers["permissions-policy"]).toBe("interest-cohort=()");
  });

  it("POST /api/onboarding includes security headers", async () => {
    // Even 400 Bad Request should have security headers
    const { headers } = await req(port, "POST", "/api/onboarding");

    expect(headers["content-security-policy"]).toBe("default-src 'none'");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["referrer-policy"]).toBe("no-referrer");
  });

  it("404 response includes security headers", async () => {
    const { headers } = await req(port, "GET", "/api/does-not-exist");

    expect(headers["content-security-policy"]).toBe("default-src 'none'");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["referrer-policy"]).toBe("no-referrer");
  });
});
