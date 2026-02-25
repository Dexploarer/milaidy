import http from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startApiServer } from "../src/api/server";

interface ResponseData {
  body: Buffer;
  headers: http.IncomingHttpHeaders;
  status: number;
  text: string;
}

function saveEnv(...keys: string[]): { restore: () => void } {
  const saved: Record<string, string | undefined> = {};
  for (const key of keys) saved[key] = process.env[key];
  return {
    restore() {
      for (const key of keys) {
        if (saved[key] === undefined) delete process.env[key];
        else process.env[key] = saved[key];
      }
    },
  };
}

function req(
  port: number,
  method: string,
  pathName: string,
  headers: Record<string, string> = {},
): Promise<ResponseData> {
  return new Promise((resolve, reject) => {
    const request = http.request(
      {
        hostname: "127.0.0.1",
        method,
        path: pathName,
        port,
        headers,
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () => {
          const body = Buffer.concat(chunks);
          resolve({
            status: response.statusCode ?? 0,
            headers: response.headers,
            body,
            text: body.toString("utf8"),
          });
        });
      },
    );
    request.on("error", reject);
    request.end();
  });
}

describe("Web surface: landing", () => {
  let close: () => Promise<void>;
  let envBackup: { restore: () => void };
  let port: number;

  beforeAll(async () => {
    envBackup = saveEnv(
      "MILADY_API_TOKEN",
      "MILADY_PAIRING_DISABLED",
      "MILADY_WEB_SURFACE",
    );
    process.env.MILADY_API_TOKEN = "test-landing-token";
    delete process.env.MILADY_PAIRING_DISABLED;
    process.env.MILADY_WEB_SURFACE = "landing";

    const server = await startApiServer({ port: 0 });
    port = server.port;
    close = server.close;
  }, 30_000);

  afterAll(async () => {
    await close();
    envBackup.restore();
  });

  it("serves the marketing landing page at /", async () => {
    const response = await req(port, "GET", "/");
    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toContain("text/html");
    expect(response.text).toContain("milAIdy &mdash; An Autonomous Agent");
  });

  it("serves landing static assets", async () => {
    const response = await req(port, "GET", "/pfp.jpg");
    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toContain("image/jpeg");
    expect(response.body.length).toBeGreaterThan(1000);
  });

  it("keeps API routes behind token auth", async () => {
    const response = await req(port, "GET", "/api/status");
    expect(response.status).toBe(401);
    expect(response.text).toContain("Unauthorized");
  });
});
