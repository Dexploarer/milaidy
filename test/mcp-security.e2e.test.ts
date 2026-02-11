
import http from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startApiServer } from "../src/api/server.js";

// ---------------------------------------------------------------------------
// HTTP helper
// ---------------------------------------------------------------------------

function req(
  port: number,
  method: string,
  p: string,
  body?: Record<string, unknown>,
): Promise<{
  status: number;
  headers: http.IncomingHttpHeaders;
  data: Record<string, unknown>;
}> {
  return new Promise((resolve, reject) => {
    const b = body ? JSON.stringify(body) : undefined;
    const r = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: p,
        method,
        headers: {
          "Content-Type": "application/json",
          ...(b ? { "Content-Length": Buffer.byteLength(b) } : {}),
        },
      },
      (res) => {
        const ch: Buffer[] = [];
        res.on("data", (c: Buffer) => ch.push(c));
        res.on("end", () => {
          const raw = Buffer.concat(ch).toString("utf-8");
          let data: Record<string, unknown> = {};
          try {
            data = JSON.parse(raw) as Record<string, unknown>;
          } catch {
            data = { _raw: raw };
          }
          resolve({ status: res.statusCode ?? 0, headers: res.headers, data });
        });
      },
    );
    r.on("error", reject);
    if (b) r.write(b);
    r.end();
  });
}

describe("MCP Security (Unauthenticated RCE)", () => {
  let port: number;
  let close: () => Promise<void>;

  beforeAll(async () => {
    // Start the server with NO API TOKEN (simulating default local install)
    // process.env.MILAIDY_API_TOKEN is undefined by default in test env usually,
    // but let's make sure.
    delete process.env.MILAIDY_API_TOKEN;
    delete process.env.MILAIDY_ALLOW_MCP_RCE;

    const server = await startApiServer({ port: 0 });
    port = server.port;
    close = server.close;
  }, 30_000);

  afterAll(async () => {
    await close();
  });

  it("should BLOCK adding a stdio server via POST /api/mcp/config/server when unauthenticated", async () => {
    const { status, data } = await req(
      port,
      "POST",
      "/api/mcp/config/server",
      {
        name: "malicious-server",
        config: {
          type: "stdio",
          command: "rm",
          args: ["-rf", "/"],
        },
      },
    );

    // CURRENT BEHAVIOR: 200 OK (Vulnerable)
    // EXPECTED BEHAVIOR after fix: 403 Forbidden

    // For reproduction, we assert the CURRENT behavior to confirm vulnerability
    // expect(status).toBe(200);

    // But since I need to fix it, I will write the assertion for the FIXED behavior
    // and let it fail initially if I were running it, or just use it to verify fix later.
    expect(status).toBe(403);
    expect(String(data.error)).toContain("Secure mode");
  });

  it("should BLOCK adding a stdio server via PUT /api/mcp/config when unauthenticated", async () => {
     const { status, data } = await req(port, "PUT", "/api/mcp/config", {
        servers: {
            "malicious-bulk": {
                type: "stdio",
                command: "whoami"
            }
        }
      });
      expect(status).toBe(403);
      expect(String(data.error)).toContain("Secure mode");
  });

  it("should BLOCK adding a stdio server via PUT /api/config when unauthenticated", async () => {
    const { status, data } = await req(port, "PUT", "/api/config", {
       mcp: {
           servers: {
               "malicious-config": {
                   type: "stdio",
                   command: "id"
               }
           }
       }
     });
     expect(status).toBe(403);
     expect(String(data.error)).toContain("Secure mode");
 });

  it("should ALLOW adding a http server via POST /api/mcp/config/server when unauthenticated", async () => {
    const { status, data } = await req(
      port,
      "POST",
      "/api/mcp/config/server",
      {
        name: "safe-remote",
        config: {
          type: "http",
          url: "http://localhost:8000/sse",
        },
      },
    );
    expect(status).toBe(200);
    expect(data.ok).toBe(true);
  });

});
