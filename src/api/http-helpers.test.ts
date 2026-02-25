import { beforeEach, describe, expect, it, vi } from "vitest";
import { writeJsonResponse } from "./http-helpers";

// Mock zlib
vi.mock("node:zlib", async () => {
  return {
    default: {
      gzip: (_buf: unknown, cb: (err: null, res: Buffer) => void) => {
        // Simple mock: just return the buffer reversed to simulate compression
        // In reality, we just want to check it was called.
        cb(null, Buffer.from("compressed"));
      },
    },
  };
});

describe("writeJsonResponse", () => {
  // biome-ignore lint/suspicious/noExplicitAny: mocking legacy objects
  let mockRes: any;
  // biome-ignore lint/suspicious/noExplicitAny: mocking legacy objects
  let mockReq: any;

  beforeEach(() => {
    mockReq = {
      headers: {},
    };
    mockRes = {
      statusCode: 200,
      setHeader: vi.fn(),
      end: vi.fn(),
      req: mockReq,
    };
  });

  it("should write small JSON without compression", async () => {
    const body = { small: "payload" };
    await writeJsonResponse(mockRes, body);

    expect(mockRes.statusCode).toBe(200);
    expect(mockRes.setHeader).toHaveBeenCalledWith(
      "Content-Type",
      "application/json",
    );
    // Content-Encoding should NOT be called
    expect(mockRes.setHeader).not.toHaveBeenCalledWith(
      "Content-Encoding",
      "gzip",
    );

    expect(mockRes.end).toHaveBeenCalledWith(JSON.stringify(body));
  });

  it("should not compress large payload if Accept-Encoding does not contain gzip", async () => {
    const body = { large: "x".repeat(2000) };
    await writeJsonResponse(mockRes, body);

    expect(mockRes.end).toHaveBeenCalledWith(JSON.stringify(body));

    expect(mockRes.setHeader).not.toHaveBeenCalledWith(
      "Content-Encoding",
      "gzip",
    );
  });

  it("should compress large payload if Accept-Encoding contains gzip", async () => {
    mockReq.headers["accept-encoding"] = "gzip, deflate";
    const body = { large: "x".repeat(2000) };

    await writeJsonResponse(mockRes, body);

    expect(mockRes.setHeader).toHaveBeenCalledWith("Content-Encoding", "gzip");
    expect(mockRes.setHeader).toHaveBeenCalledWith("Vary", "Accept-Encoding");

    // Check call to res.end
    expect(mockRes.end).toHaveBeenCalledWith(Buffer.from("compressed"));
  });
});
