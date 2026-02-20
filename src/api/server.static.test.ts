import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { serveStaticUi, _resetUiDirForTest } from "./server";
import fs from "node:fs";
import path from "node:path";
import { PassThrough } from "node:stream";

// Hoisted mock
vi.mock("node:fs", () => {
  const statSync = vi.fn();
  const readFileSync = vi.fn();
  const promises = {
    stat: vi.fn(),
  };
  const createReadStream = vi.fn();

  return {
    default: {
      statSync,
      readFileSync,
      promises,
      createReadStream,
    },
    statSync,
    readFileSync,
    promises,
    createReadStream,
  };
});

describe("serveStaticUi", () => {
  let req: any;
  let res: any;

  beforeEach(() => {
    _resetUiDirForTest();
    process.env.NODE_ENV = "production";

    req = {
      method: "GET",
      headers: {},
    };

    // Mock response object as a PassThrough stream to satisfy pipeline
    res = new PassThrough();
    res.writeHead = vi.fn();
    // We spy on 'end' but let the stream handle the event emission
    vi.spyOn(res, 'end');
  });

  afterEach(() => {
    vi.clearAllMocks();
    delete process.env.NODE_ENV;
  });

  it("should return false if NODE_ENV is not production", async () => {
    process.env.NODE_ENV = "development";
    const result = await serveStaticUi(req, res, "/assets/style.css");
    expect(result).toBe(false);
  });

  it("should serve static file using async streams if file exists", async () => {
    // Mock resolveUiDir finding the index.html
    (fs.statSync as any).mockImplementation((p: string) => {
        if (p.endsWith("index.html")) {
            return { isFile: () => true };
        }
        throw new Error("ENOENT");
    });
    (fs.readFileSync as any).mockReturnValue(Buffer.from("<html></html>"));

    // Mock file stat finding the requested file
    const mockStat = { isFile: () => true, size: 100 };
    (fs.promises.stat as any).mockResolvedValue(mockStat);

    // Mock read stream
    const mockStream = new PassThrough();
    (fs.createReadStream as any).mockReturnValue(mockStream);

    // Push data synchronously
    mockStream.push(Buffer.from("css content"));
    mockStream.push(null); // End the read stream

    const result = await serveStaticUi(req, res, "/assets/style.css");

    expect(result).toBe(true);
    expect(fs.promises.stat).toHaveBeenCalled();
    expect(fs.createReadStream).toHaveBeenCalled();
    expect(res.writeHead).toHaveBeenCalledWith(200, expect.objectContaining({
        "Content-Type": "text/css; charset=utf-8",
        "Content-Length": 100
    }));
  });

  it("should fall back to index.html if file does not exist (SPA support)", async () => {
    // Mock resolveUiDir finding the index.html
    (fs.statSync as any).mockImplementation((p: string) => {
        if (p.endsWith("index.html")) {
            return { isFile: () => true };
        }
        throw new Error("ENOENT");
    });
    const indexHtmlContent = Buffer.from("<html>SPA Index</html>");
    (fs.readFileSync as any).mockReturnValue(indexHtmlContent);

    // Mock file stat throwing ENOENT for the requested path
    (fs.promises.stat as any).mockRejectedValue(new Error("ENOENT"));

    const result = await serveStaticUi(req, res, "/some/random/route");

    expect(result).toBe(true);
    // Should serve the cached index.html synchronously (as it is memory cached)
    expect(res.writeHead).toHaveBeenCalledWith(200, expect.objectContaining({
        "Content-Type": "text/html; charset=utf-8",
        "Content-Length": indexHtmlContent.length
    }));
    // Note: res.end is a method on PassThrough, we mocked it on prototype or instance?
    // Using spyOn(res, 'end') above.
    expect(res.end).toHaveBeenCalledWith(indexHtmlContent);
  });
});
