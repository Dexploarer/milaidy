import { test, expect } from "vitest";
import { startApiServer } from "./server";

let serverPort: number;
let closeServer: () => Promise<void>;

test("rate limiting works", async () => {
  // Start server on a random port
  const result = await startApiServer({ port: 0 });
  serverPort = result.port;
  closeServer = result.close;

  try {
    const limit = 600;
    const url = `http://127.0.0.1:${serverPort}/api/status`;

    // Send limit requests
    const promises = [];
    for (let i = 0; i < limit; i++) {
      promises.push(fetch(url).then((r) => r.status));
    }

    const results = await Promise.all(promises);
    // Depending on timing/concurrency, some might fail if the server is slow, but we expect most to be 200
    // Actually, nodejs single threaded so they are processed sequentially in the event loop.
    // However, rate limit is per IP. localhost is 127.0.0.1.

    // Check that we got mostly 200s (or at least didn't hit rate limit early)
    const rateLimitedCount = results.filter((s) => s === 429).length;
    expect(rateLimitedCount).toBe(0);

    // Send one more request - should be rate limited
    const res = await fetch(url);
    expect(res.status).toBe(429);

    const body = await res.json();
    expect(body.error).toBe("Too many requests. Please try again later.");
  } finally {
    await closeServer();
  }
}, 30000);
