
import type { IncomingMessage, ServerResponse } from "node:http";
import { describe, expect, it, vi } from "vitest";
import { writeJsonResponse } from "./http-helpers";

// Mock http.ServerResponse and IncomingMessage
function createMockResponse(headers: Record<string, string> = {}) {
  const resHeaders: Record<string, string | number> = {};
  let body: unknown = null;
  let statusCode = 200;

  const req = {
    headers,
  } as unknown as IncomingMessage;

  const res = {
    statusCode,
    setHeader: vi.fn((key: string, value: string | number) => {
      resHeaders[key.toLowerCase()] = value;
    }),
    end: vi.fn((data: unknown) => {
      body = data;
    }),
    req, // Attach req to res
  } as unknown as ServerResponse & { req: IncomingMessage };

  return { res, resHeaders, getBody: () => body };
}

// Mock response WITHOUT req (simulating older tests)
function createMockResponseNoReq() {
  const resHeaders: Record<string, string | number> = {};
  let body: unknown = null;
  let statusCode = 200;

  const res = {
    statusCode,
    setHeader: vi.fn((key: string, value: string | number) => {
      resHeaders[key.toLowerCase()] = value;
    }),
    end: vi.fn((data: unknown) => {
      body = data;
    }),
  } as unknown as ServerResponse;

  return { res, resHeaders, getBody: () => body };
}

describe("writeJsonResponse compression", () => {
  it("should NOT compress small responses (< 1KB)", async () => {
    const { res, resHeaders, getBody } = createMockResponse({
      "accept-encoding": "gzip",
    });
    const smallBody = { message: "small" };

    await writeJsonResponse(res, smallBody);

    expect(resHeaders["vary"]).toBe("Accept-Encoding");
    expect(resHeaders["content-encoding"]).toBeUndefined();
    expect(getBody()).toBe(JSON.stringify(smallBody));
  });

  it("should compress large responses (> 1KB) if client accepts gzip", async () => {
    const { res, resHeaders, getBody } = createMockResponse({
      "accept-encoding": "gzip, deflate",
    });
    // Create a large body > 1KB
    const largeBody = { message: "a".repeat(1024) };

    await writeJsonResponse(res, largeBody);

    expect(resHeaders["vary"]).toBe("Accept-Encoding");
    expect(resHeaders["content-encoding"]).toBe("gzip");
    expect(Buffer.isBuffer(getBody())).toBe(true);
  });

  it("should NOT compress large responses if client does NOT accept gzip", async () => {
    const { res, resHeaders, getBody } = createMockResponse({
      "accept-encoding": "identity",
    });
    const largeBody = { message: "a".repeat(1024) };

    await writeJsonResponse(res, largeBody);

    expect(resHeaders["content-encoding"]).toBeUndefined();
    expect(getBody()).toBe(JSON.stringify(largeBody));
  });

  it("should handle missing res.req gracefully (no compression)", async () => {
    const { res, resHeaders, getBody } = createMockResponseNoReq();
    const largeBody = { message: "a".repeat(1024) };

    await writeJsonResponse(res, largeBody);

    expect(resHeaders["content-encoding"]).toBeUndefined();
    expect(getBody()).toBe(JSON.stringify(largeBody));
  });
});
