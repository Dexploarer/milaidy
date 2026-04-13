import * as fs from "node:fs";
import puppeteer from "puppeteer-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  FRAME_FILE,
  hasFrameFile,
  isBrowserCaptureRunning,
  startBrowserCapture,
  stopBrowserCapture,
} from "./browser-capture";

vi.mock("puppeteer-core", () => ({
  default: {
    launch: vi.fn(),
  },
}));

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    existsSync: vi.fn(),
    writeFileSync: vi.fn(),
  };
});

describe("browser-capture", () => {
  let mockBrowser: unknown;
  let mockPage: unknown;
  let mockCdp: unknown;

  beforeEach(async () => {
    vi.clearAllMocks();

    // reset global state for tests that modify it
    await stopBrowserCapture();

    mockCdp = {
      on: vi.fn(),
      send: vi.fn(),
    };

    mockPage = {
      setViewport: vi.fn(),
      evaluateOnNewDocument: vi.fn(),
      goto: vi.fn(),
      createCDPSession: vi.fn().mockResolvedValue(mockCdp),
    };

    mockBrowser = {
      newPage: vi.fn().mockResolvedValue(mockPage),
      close: vi.fn(),
    };

    vi.mocked(puppeteer.launch).mockResolvedValue(mockBrowser as unknown);
  });

  afterEach(async () => {
    await stopBrowserCapture();
  });

  it("should start the browser capture", async () => {
    await startBrowserCapture({ url: "http://localhost:3000" });

    expect(puppeteer.launch).toHaveBeenCalled();
    expect(mockBrowser.newPage).toHaveBeenCalled();
    expect(mockPage.setViewport).toHaveBeenCalledWith({
      width: 1280,
      height: 720,
      deviceScaleFactor: 1,
    });
    expect(mockPage.goto).toHaveBeenCalledWith(
      "http://localhost:3000/?popout=",
      { waitUntil: "networkidle0", timeout: 60000 },
    );
    expect(mockPage.createCDPSession).toHaveBeenCalled();
    expect(mockCdp.on).toHaveBeenCalledWith(
      "Page.screencastFrame",
      expect.any(Function),
    );
    expect(mockCdp.send).toHaveBeenCalledWith(
      "Page.startScreencast",
      expect.objectContaining({
        format: "jpeg",
        maxWidth: 1280,
        maxHeight: 720,
      }),
    );
    expect(isBrowserCaptureRunning()).toBe(true);
  });

  it("should stop the browser capture", async () => {
    await startBrowserCapture({ url: "http://localhost:3000" });
    expect(isBrowserCaptureRunning()).toBe(true);

    await stopBrowserCapture();

    expect(mockBrowser.close).toHaveBeenCalled();
    expect(isBrowserCaptureRunning()).toBe(false);
  });

  it("should stop safely even when closing fails", async () => {
    mockBrowser.close.mockRejectedValue(new Error("Close failed"));
    await startBrowserCapture({ url: "http://localhost:3000" });
    await stopBrowserCapture();
    expect(isBrowserCaptureRunning()).toBe(false);
  });

  it("should stop gracefully if not running", async () => {
    await stopBrowserCapture();
    expect(isBrowserCaptureRunning()).toBe(false);
    expect(mockBrowser.close).not.toHaveBeenCalled();
  });

  it("should not start if already running", async () => {
    await startBrowserCapture({ url: "http://localhost:3000" });
    expect(puppeteer.launch).toHaveBeenCalledTimes(1);

    await startBrowserCapture({ url: "http://localhost:3000" });
    expect(puppeteer.launch).toHaveBeenCalledTimes(1);
  });

  it("should check if frame file exists", () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    expect(hasFrameFile()).toBe(true);
    expect(fs.existsSync).toHaveBeenCalledWith(FRAME_FILE);
  });

  it("ensurePopoutUrl appends correctly", async () => {
    await startBrowserCapture({ url: "http://localhost/test" });
    expect(mockPage.goto).toHaveBeenCalledWith(
      expect.stringContaining("?popout="),
      expect.any(Object),
    );
  });

  it("ensurePopoutUrl works with hash routing", async () => {
    await stopBrowserCapture();
    await startBrowserCapture({ url: "http://localhost/#/test" });
    expect(mockPage.goto).toHaveBeenCalledWith(
      "http://localhost/#/test?popout",
      expect.any(Object),
    );
  });

  it("ensurePopoutUrl works with hash routing and query", async () => {
    await stopBrowserCapture();
    await startBrowserCapture({ url: "http://localhost/#/test?a=1" });
    expect(mockPage.goto).toHaveBeenCalledWith(
      "http://localhost/#/test?a=1&popout",
      expect.any(Object),
    );
  });

  it("ensurePopoutUrl fallback invalid URL", async () => {
    await stopBrowserCapture();
    await startBrowserCapture({ url: "invalid-url" });
    expect(mockPage.goto).toHaveBeenCalledWith(
      "invalid-url?popout",
      expect.any(Object),
    );
  });

  it("ensurePopoutUrl fallback invalid URL with existing search", async () => {
    await stopBrowserCapture();
    await startBrowserCapture({ url: "invalid-url?a=1" });
    expect(mockPage.goto).toHaveBeenCalledWith(
      "invalid-url?a=1&popout",
      expect.any(Object),
    );
  });

  it("evaluateOnNewDocument seeds localStorage properly", async () => {
    await startBrowserCapture({
      url: "http://localhost",
      overlayLayout: "{}",
      theme: "milady",
      avatarIndex: 1,
      destinationId: "dest123",
    });

    expect(mockPage.evaluateOnNewDocument).toHaveBeenCalledWith(
      expect.any(Function),
      "{}",
      "milady",
      1,
      "dest123",
    );

    // Test the inner evaluateOnNewDocument function
    const evalFn = mockPage.evaluateOnNewDocument.mock.calls[0][0];

    // Setup global window/localStorage for evaluation
    const mockLocalStorage = {
      setItem: vi.fn(),
    };
    global.localStorage = mockLocalStorage as unknown;

    evalFn("{}", "milady", 1, "dest123");

    expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
      "milady.stream.overlay-layout.v1",
      "{}",
    );
    expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
      "milady.stream.overlay-layout.v1.dest123",
      "{}",
    );
    expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
      "milady:theme",
      "milady",
    );
    expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
      "milady_avatar_index",
      "1",
    );

    // Clear
    global.localStorage = undefined as unknown;
  });

  it("evaluateOnNewDocument works without optional fields", async () => {
    await startBrowserCapture({
      url: "http://localhost",
    });

    const evalFn = mockPage.evaluateOnNewDocument.mock.calls[0][0];
    const mockLocalStorage = {
      setItem: vi.fn(),
    };
    global.localStorage = mockLocalStorage as unknown;

    evalFn(undefined, undefined, undefined, undefined);

    expect(mockLocalStorage.setItem).not.toHaveBeenCalled();
    global.localStorage = undefined as unknown;
  });

  it("evaluateOnNewDocument works without destinationId", async () => {
    await startBrowserCapture({
      url: "http://localhost",
      overlayLayout: "{}",
    });

    const evalFn = mockPage.evaluateOnNewDocument.mock.calls[0][0];
    const mockLocalStorage = {
      setItem: vi.fn(),
    };
    global.localStorage = mockLocalStorage as unknown;

    evalFn("{}", undefined, undefined, undefined);

    expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
      "milady.stream.overlay-layout.v1",
      "{}",
    );
    expect(mockLocalStorage.setItem).not.toHaveBeenCalledWith(
      "milady.stream.overlay-layout.v1.undefined",
      "{}",
    );
    global.localStorage = undefined as unknown;
  });

  it("cdp event handler writes to file", async () => {
    await startBrowserCapture({ url: "http://localhost:3000" });
    const handler = mockCdp.on.mock.calls.find(
      (call: unknown) => call[0] === "Page.screencastFrame",
    )[1];

    await handler({
      data: Buffer.from("test").toString("base64"),
      sessionId: 1,
    });

    expect(fs.writeFileSync).toHaveBeenCalledWith(
      FRAME_FILE,
      expect.any(Buffer),
    );
    expect(mockCdp.send).toHaveBeenCalledWith("Page.screencastFrameAck", {
      sessionId: 1,
    });
  });

  it("cdp event handler handles write exceptions safely", async () => {
    vi.mocked(fs.writeFileSync).mockImplementation(() => {
      throw new Error("Write failed");
    });

    await startBrowserCapture({ url: "http://localhost:3000" });
    const handler = mockCdp.on.mock.calls.find(
      (call: unknown) => call[0] === "Page.screencastFrame",
    )[1];

    // This should not throw uncaught exception
    await handler({
      data: Buffer.from("test").toString("base64"),
      sessionId: 1,
    });
    expect(fs.writeFileSync).toHaveBeenCalled();
  });

  it("cdp event handler does not write if stopSignal is true", async () => {
    await startBrowserCapture({ url: "http://localhost:3000" });
    const handler = mockCdp.on.mock.calls.find(
      (call: unknown) => call[0] === "Page.screencastFrame",
    )[1];

    await stopBrowserCapture(); // sets stopSignal to true

    await handler({
      data: Buffer.from("test").toString("base64"),
      sessionId: 1,
    });

    expect(fs.writeFileSync).not.toHaveBeenCalled();
  });

  it("cdp event handler ignores empty buffers", async () => {
    await startBrowserCapture({ url: "http://localhost:3000" });
    const handler = mockCdp.on.mock.calls.find(
      (call: unknown) => call[0] === "Page.screencastFrame",
    )[1];

    await handler({ data: "", sessionId: 1 });

    expect(fs.writeFileSync).not.toHaveBeenCalled();
    expect(mockCdp.send).toHaveBeenCalledWith("Page.screencastFrameAck", {
      sessionId: 1,
    });
  });
});
