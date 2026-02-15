
import http from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startApiServer } from "../src/api/server.js";

function req(port: number, method: string, path: string): Promise<http.IncomingMessage> {
  return new Promise((resolve, reject) => {
    const request = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path,
        method,
      },
      (res) => {
        resolve(res);
      }
    );
    request.on("error", reject);
    request.end();
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

  it("should set X-Frame-Options: DENY", async () => {
    const res = await req(port, "GET", "/api/status");
    expect(res.headers["x-frame-options"]).toBe("DENY");
  });

  it("should set X-Content-Type-Options: nosniff", async () => {
    const res = await req(port, "GET", "/api/status");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
  });

  it("should set Referrer-Policy: no-referrer", async () => {
    const res = await req(port, "GET", "/api/status");
    expect(res.headers["referrer-policy"]).toBe("no-referrer");
  });

  it("should set Permissions-Policy: interest-cohort=()", async () => {
    const res = await req(port, "GET", "/api/status");
    expect(res.headers["permissions-policy"]).toBe("interest-cohort=()");
  });

  it("should set strict Content-Security-Policy for API routes", async () => {
    const res = await req(port, "GET", "/api/status");
    expect(res.headers["content-security-policy"]).toBe("default-src 'none'");
  });
});
