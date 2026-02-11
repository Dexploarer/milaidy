import type http from "node:http";
import type { AgentRuntime } from "@elizaos/core";
import { describe, expect, it, vi } from "vitest";
import { handleDatabaseRoute } from "./database.js";

// Mock AgentRuntime
const mockRuntime = {
  adapter: {
    db: {
      execute: vi.fn(),
    },
  },
} as unknown as AgentRuntime;

type MockResponse = http.ServerResponse & {
  body: string;
  headers: Record<string, string>;
  statusCode: number;
};

function createMockResponse(): MockResponse {
  const headers: Record<string, string> = {};
  const response: Partial<MockResponse> = {
    statusCode: 200,
    body: "",
    headers,
    setHeader(name: string, value: number | string | readonly string[]) {
      headers[name.toLowerCase()] = Array.isArray(value)
        ? value.join(",")
        : String(value);
      return response as MockResponse;
    },
    end(chunk?: unknown) {
      if (typeof chunk === "string") {
        response.body = chunk;
      } else if (Buffer.isBuffer(chunk)) {
        response.body = chunk.toString("utf8");
      } else if (chunk != null) {
        response.body = String(chunk);
      }
      return response as MockResponse;
    },
  };
  return response as MockResponse;
}

function createMockRequest(
  method: string,
  url: string,
  body?: unknown,
): http.IncomingMessage {
  const req = {
    method,
    url,
    headers: {},
    on: (event: string, callback: (...args: unknown[]) => void) => {
      if (event === "data" && body) {
        callback(Buffer.from(JSON.stringify(body)));
      }
      if (event === "end") {
        callback();
      }
    },
  } as unknown as http.IncomingMessage;
  return req;
}

describe("handleDatabaseRoute", () => {
  it("returns 400 for malformed table name encoding", async () => {
    const req = { method: "PATCH" } as http.IncomingMessage;
    const res = createMockResponse();

    const handled = await handleDatabaseRoute(
      req,
      res,
      { adapter: {} } as never,
      "/api/database/tables/%E0%A4%A/rows",
    );

    expect(handled).toBe(true);
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body)).toEqual({
      error: "Invalid table name: malformed URL encoding",
    });
  });

  it("should handle GET /api/database/status without runtime", async () => {
    const req = createMockRequest("GET", "/api/database/status");
    const res = createMockResponse();

    const handled = await handleDatabaseRoute(
      req,
      res,
      null,
      "/api/database/status",
    );

    expect(handled).toBe(true);
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.connected).toBe(false);
  });

  it("should handle GET /api/database/config", async () => {
    const req = createMockRequest("GET", "/api/database/config");
    const res = createMockResponse();

    const handled = await handleDatabaseRoute(
      req,
      res,
      null,
      "/api/database/config",
    );

    expect(handled).toBe(true);
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.config).toBeDefined();
  });

  it("should return 503 for tables route without runtime", async () => {
    const req = createMockRequest("GET", "/api/database/tables");
    const res = createMockResponse();

    const handled = await handleDatabaseRoute(
      req,
      res,
      null,
      "/api/database/tables",
    );

    expect(handled).toBe(true);
    expect(res.statusCode).toBe(503);
  });

  it("should return false for unknown route with runtime", async () => {
    const req = createMockRequest("GET", "/api/database/unknown");
    const res = createMockResponse();

    const handled = await handleDatabaseRoute(
      req,
      res,
      mockRuntime,
      "/api/database/unknown",
    );

    expect(handled).toBe(false);
  });
});
