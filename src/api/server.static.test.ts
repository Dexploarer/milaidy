import fs from "node:fs";
import type http from "node:http";
import { PassThrough } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { _resetUiDirForTest, serveStaticUi } from "./server";

// Mock fs module
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    default: {
      ...actual.default,
      statSync: vi.fn(),
      readFileSync: vi.fn(),
      createReadStream: vi.fn(),
      promises: {
        ...actual.default.promises,
        stat: vi.fn(),
      },
    },
  };
});

describe("serveStaticUi", () => {
  let req: http.IncomingMessage;
  let res: http.ServerResponse;
  let resEnd: any;
  let resWriteHead: any;

  beforeEach(() => {
    vi.resetModules();
    _resetUiDirForTest();
    process.env.NODE_ENV = "production";

    req = {
      method: "GET",
      headers: {},
    } as unknown as http.IncomingMessage;

    resEnd = vi.fn();
    resWriteHead = vi.fn();

    // Mock response object compatible with pipeline
    const resStream = new PassThrough();
    res = resStream as unknown as http.ServerResponse;
    res.writeHead = resWriteHead;
    resEnd = vi.spyOn(resStream, "end");
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should serve a file if it exists in the UI directory", async () => {
    // 1. Mock resolveUiDir (synchronous checks)
    // It checks for index.html existence
    vi.mocked(fs.statSync).mockReturnValue({
      isFile: () => true,
    } as any);
    vi.mocked(fs.readFileSync).mockReturnValue(Buffer.from("<html></html>"));

    // 2. Mock serveStaticUi file check (asynchronous)
    vi.mocked(fs.promises.stat).mockResolvedValue({
      isFile: () => true,
      size: 100,
    } as any);

    // 3. Mock file stream
    const mockFileStream = new PassThrough();
    vi.mocked(fs.createReadStream).mockReturnValue(mockFileStream as any);

    // Push data to stream so pipeline completes
    setTimeout(() => {
      mockFileStream.push(Buffer.from("css content"));
      mockFileStream.push(null); // End of stream
    }, 10);

    const result = await serveStaticUi(req, res, "/assets/style.css");

    expect(result).toBe(true);
    expect(resWriteHead).toHaveBeenCalledWith(
      200,
      expect.objectContaining({
        "Content-Type": "text/css; charset=utf-8",
        "Content-Length": 100,
      }),
    );
    expect(fs.createReadStream).toHaveBeenCalled();
  });

  it("should return false if NODE_ENV is not production", async () => {
    process.env.NODE_ENV = "development";
    // We need to make sure resolveUiDir is not cached with a valid value from previous test
    _resetUiDirForTest();

    const result = await serveStaticUi(req, res, "/assets/style.css");
    expect(result).toBe(false);
  });

  it("should serve index.html (SPA fallback) if file not found", async () => {
    // 1. Mock resolveUiDir success
    vi.mocked(fs.statSync).mockReturnValue({ isFile: () => true } as any);
    vi.mocked(fs.readFileSync).mockReturnValue(Buffer.from("<html>SPA</html>"));

    // 2. Mock file missing (ENOENT)
    const error = new Error("File not found");
    (error as any).code = "ENOENT";
    vi.mocked(fs.promises.stat).mockRejectedValue(error);

    const result = await serveStaticUi(req, res, "/missing-route");

    expect(result).toBe(true);
    // Should serve the index.html content (mocked above)
    // sendStaticResponse calls res.writeHead and res.end
    expect(resWriteHead).toHaveBeenCalledWith(
      200,
      expect.objectContaining({
        "Content-Type": "text/html; charset=utf-8",
      }),
    );
    // Note: sendStaticResponse uses res.end(body), not pipeline
    expect(resEnd).toHaveBeenCalledWith(Buffer.from("<html>SPA</html>"));
  });
});
