import http from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startApiServer } from "../src/api/server.js";

function req(
  port: number,
  method: string,
  p: string,
): Promise<{
  status: number;
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
        res.resume(); // Consume response to free memory
        resolve({ status: res.statusCode ?? 0 });
      },
    );
    r.on("error", reject);
    r.end();
  });
}

describe("API Rate Limiting", () => {
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

  it("enforces rate limits", async () => {
    const LIMIT = 600;
    const promises: Promise<{ status: number }>[] = [];

    // Send LIMIT requests
    for (let i = 0; i < LIMIT; i++) {
      promises.push(req(port, "GET", "/api/status"));
    }

    await Promise.all(promises);

    // The next request should be blocked
    const { status } = await req(port, "GET", "/api/status");
    expect(status).toBe(429);
  }, 30_000);
});
