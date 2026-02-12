import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startApiServer } from "./server.js";

describe("API Security Headers", () => {
  let server: { port: number; close: () => Promise<void> };
  let baseUrl: string;

  beforeAll(async () => {
    // Start server on random port (0)
    server = await startApiServer({ port: 0 });
    baseUrl = `http://127.0.0.1:${server.port}`;
  });

  afterAll(async () => {
    if (server) await server.close();
  });

  it("should set security headers on API responses", async () => {
    const res = await fetch(`${baseUrl}/api/status`);
    expect(res.status).toBe(200);

    const headers = res.headers;
    expect(headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(headers.get("X-Frame-Options")).toBe("DENY");
    expect(headers.get("Content-Security-Policy")).toBe("default-src 'none'");
    expect(headers.get("Strict-Transport-Security")).toContain(
      "max-age=31536000",
    );
    expect(headers.get("Referrer-Policy")).toBe("no-referrer");
    expect(headers.get("Permissions-Policy")).toBe("interest-cohort=()");
  });
});
