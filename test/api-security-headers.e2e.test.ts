
import http from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startApiServer } from "../src/api/server.js";

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
        res.resume();
        resolve({ status: res.statusCode ?? 0, headers: res.headers });
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

  it("GET /api/status has security headers", async () => {
    const { headers } = await req(port, "GET", "/api/status");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["referrer-policy"]).toBe("no-referrer");
    expect(headers["permissions-policy"]).toBe("interest-cohort=()");
    expect(headers["content-security-policy"]).toContain("default-src 'none'");
  });

  it("GET / (UI) does NOT have strict content-security-policy", async () => {
    const { headers } = await req(port, "GET", "/");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["content-security-policy"]).toBeUndefined();
  });
});
