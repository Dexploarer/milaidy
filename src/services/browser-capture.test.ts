import { mock, spyOn, describe, it, expect, beforeEach, afterEach } from "bun:test";

const vi = {
  fn: mock,
  mock: mock.module,
  clearAllMocks: () => {},
  spyOn,
  mocked: (fn: any) => fn as ReturnType<typeof mock>,
};

vi.mock("node:fs", () => {
  return {
    existsSync: vi.fn(),
    writeFileSync: vi.fn(),
  };
});

vi.mock("puppeteer-core", () => {
  return {
    default: {
      launch: vi.fn(),
    },
  };
});

const nodeFs = await import("node:fs");

const {
  startBrowserCapture,
  stopBrowserCapture,
  isBrowserCaptureRunning,
  hasFrameFile,
} = await import("./browser-capture");

const puppeteer = (await import("puppeteer-core")).default;

describe("browser-capture", () => {
  let mockBrowser: any;
  let mockPage: any;
  let mockCdpSession: any;

  beforeEach(() => {
    mockCdpSession = {
      on: vi.fn(),
      send: vi.fn(),
    };

    mockPage = {
      setViewport: vi.fn(),
      evaluateOnNewDocument: vi.fn(),
      goto: vi.fn(),
      createCDPSession: vi.fn().mockResolvedValue(mockCdpSession),
    };

    mockBrowser = {
      newPage: vi.fn().mockResolvedValue(mockPage),
      close: vi.fn(),
    };

    vi.mocked(puppeteer.launch).mockResolvedValue(mockBrowser);
  });

  afterEach(async () => {
    await stopBrowserCapture();
  });

  describe("startBrowserCapture", () => {
    it("should start a new browser capture session", async () => {
      expect(isBrowserCaptureRunning()).toBe(false);

      await startBrowserCapture({
        url: "http://localhost:3000",
      });

      expect(puppeteer.launch).toHaveBeenCalled();
      expect(mockBrowser.newPage).toHaveBeenCalled();
      expect(mockPage.setViewport).toHaveBeenCalledWith({
        width: 1280,
        height: 720,
        deviceScaleFactor: 1,
      });
      expect(mockPage.evaluateOnNewDocument).toHaveBeenCalled();
      expect(mockPage.goto).toHaveBeenCalledWith(
        expect.stringContaining("?popout"),
        expect.objectContaining({ waitUntil: "networkidle0" })
      );
      expect(mockPage.createCDPSession).toHaveBeenCalled();
      expect(mockCdpSession.on).toHaveBeenCalledWith(
        "Page.screencastFrame",
        expect.any(Function)
      );
      expect(mockCdpSession.send).toHaveBeenCalledWith(
        "Page.startScreencast",
        expect.any(Object)
      );

      expect(isBrowserCaptureRunning()).toBe(true);
    });

    it("should correctly handle custom configuration", async () => {
      await startBrowserCapture({
        url: "http://localhost:3000",
        width: 1920,
        height: 1080,
        quality: 90,
        overlayLayout: '{"foo":"bar"}',
        theme: "milady",
        avatarIndex: 5,
        destinationId: "test-dest",
      });

      expect(mockPage.setViewport).toHaveBeenCalledWith({
        width: 1920,
        height: 1080,
        deviceScaleFactor: 1,
      });
      expect(mockPage.evaluateOnNewDocument).toHaveBeenCalledWith(
        expect.any(Function),
        '{"foo":"bar"}',
        "milady",
        5,
        "test-dest"
      );
    });

    it("should be idempotent if already running", async () => {
      await startBrowserCapture({ url: "http://localhost:3000" });
      const launchCount = vi.mocked(puppeteer.launch).mock.calls.length;

      await startBrowserCapture({ url: "http://localhost:3000" });
      expect(vi.mocked(puppeteer.launch).mock.calls.length).toBe(launchCount);
    });

    it("should write screencast frames to file", async () => {
      await startBrowserCapture({ url: "http://localhost:3000" });

      // Find the screencast frame handler
      const onCall = mockCdpSession.on.mock.calls.find(
        (c: any) => c[0] === "Page.screencastFrame"
      );
      expect(onCall).toBeDefined();

      const handler = onCall[1];
      const base64Data = Buffer.from("test frame").toString("base64");

      await handler({
        data: base64Data,
        sessionId: 123,
      });

      expect(nodeFs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining("milady-stream-frame.jpg"),
        expect.any(Buffer)
      );
      expect(mockCdpSession.send).toHaveBeenCalledWith(
        "Page.screencastFrameAck",
        { sessionId: 123 }
      );
    });

    it("should not write screencast frames if stopSignal is true", async () => {
      await startBrowserCapture({ url: "http://localhost:3000" });
      await stopBrowserCapture();

      // Find the screencast frame handler
      const onCall = mockCdpSession.on.mock.calls.find(
        (c: any) => c[0] === "Page.screencastFrame"
      );
      expect(onCall).toBeDefined();

      const handler = onCall[1];
      const base64Data = Buffer.from("test frame").toString("base64");

      // Reset mock to ensure we don't count earlier calls
      vi.mocked(nodeFs.writeFileSync).mockClear();
      vi.mocked(mockCdpSession.send).mockClear();

      await handler({
        data: base64Data,
        sessionId: 123,
      });

      expect(nodeFs.writeFileSync).not.toHaveBeenCalled();
      expect(mockCdpSession.send).not.toHaveBeenCalledWith("Page.screencastFrameAck", expect.anything());
    });
  });

  describe("stopBrowserCapture", () => {
    it("should stop an active session", async () => {
      await startBrowserCapture({ url: "http://localhost:3000" });
      expect(isBrowserCaptureRunning()).toBe(true);

      await stopBrowserCapture();

      expect(mockBrowser.close).toHaveBeenCalled();
      expect(isBrowserCaptureRunning()).toBe(false);
    });

    it("should do nothing if no session is active", async () => {
      await stopBrowserCapture();
      expect(mockBrowser.close).not.toHaveBeenCalled();
    });

    it("should swallow errors when browser close fails", async () => {
      await startBrowserCapture({ url: "http://localhost:3000" });

      let wasThrown = false;
      mockBrowser.close = () => {
        wasThrown = true;
        return Promise.reject(new Error("Close failed"));
      };

      let threwError = false;
      try {
        await stopBrowserCapture();
      } catch (e) {
        threwError = true;
      }
      expect(threwError).toBe(false);
      expect(wasThrown).toBe(true);
      expect(isBrowserCaptureRunning()).toBe(false);
    });
  });

  describe("hasFrameFile", () => {
    it("should return the result of existsSync", () => {
      vi.mocked(nodeFs.existsSync).mockReturnValue(true);
      expect(hasFrameFile()).toBe(true);

      vi.mocked(nodeFs.existsSync).mockReturnValue(false);
      expect(hasFrameFile()).toBe(false);
    });
  });
});