import http from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

function req(
  port: number,
  method: string,
  p: string,
): Promise<{ status: number; headers: http.IncomingHttpHeaders; data: unknown }> {
  return new Promise((resolve, reject) => {
    const r = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: p,
        method,
      },
      (res) => {
        const ch: Buffer[] = [];
        res.on("data", (c: Buffer) => ch.push(c));
        res.on("end", () => {
          const raw = Buffer.concat(ch).toString("utf-8");
          let data: unknown = raw;
          try {
            data = JSON.parse(raw);
          } catch {}
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
    // Start server without auth
    delete process.env.MILADY_API_TOKEN;

    // Dynamically import startApiServer to avoid side effects during load
    const { startApiServer } = await import("../src/api/server");
    const server = await startApiServer({ port: 0 });
    port = server.port;
    close = server.close;
  });

  afterAll(async () => {
    if (close) await close();
  });

  it("should set security headers on API responses", async () => {
    const { headers } = await req(port, "GET", "/api/status");

    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["permissions-policy"]).toContain("interest-cohort=()");
  });

  it("should set security headers on static asset responses", async () => {
    // Note: This might return 404/403 if UI is not built, but headers should still be present on errors handled by our server
    // However, 404 is handled by `error(res, "Not found", 404)` which is JSON.
    // If serveStaticUi handles it, it writes headers.
    // Let's check a non-existent static file to trigger fallthrough or error.
    // Actually, sendStaticResponse is only called if file exists.
    // The fallback SPA index.html serving also uses sendStaticResponse.

    // We can try to fetch a known non-existent file, which falls back to 404 "Not found" JSON response.
    // The JSON error response should ALSO have security headers.

    const { headers } = await req(port, "GET", "/some-random-path");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["x-frame-options"]).toBe("DENY");
  });
});
