import { existsSync, writeFileSync } from "node:fs";
import puppeteer from "puppeteer-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  FRAME_FILE,
  hasFrameFile,
  isBrowserCaptureRunning,
  startBrowserCapture,
  stopBrowserCapture,
} from "./browser-capture";

vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

vi.mock("node:os", () => ({
  tmpdir: vi.fn(() => "/tmp"),
}));

vi.mock("node:path", () => ({
  join: vi.fn((...args) => args.join("/")),
}));

vi.mock("puppeteer-core", () => ({
  default: {
    launch: vi.fn(),
  },
}));

describe("browser-capture", () => {
  // biome-ignore lint/suspicious/noExplicitAny: needed for testing
  let mockBrowser: any;
  // biome-ignore lint/suspicious/noExplicitAny: needed for testing
  let mockPage: any;
  // biome-ignore lint/suspicious/noExplicitAny: needed for testing
  let mockCdp: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockCdp = {
      on: vi.fn(),
      send: vi.fn().mockResolvedValue({}),
    };

    mockPage = {
      setViewport: vi.fn().mockResolvedValue({}),
      evaluateOnNewDocument: vi.fn().mockResolvedValue({}),
      goto: vi.fn().mockResolvedValue({}),
      createCDPSession: vi.fn().mockResolvedValue(mockCdp),
    };

    mockBrowser = {
      newPage: vi.fn().mockResolvedValue(mockPage),
      close: vi.fn().mockResolvedValue({}),
    };

    vi.mocked(puppeteer.launch).mockResolvedValue(mockBrowser);
  });

  afterEach(async () => {
    await stopBrowserCapture();
  });

  describe("startBrowserCapture", () => {
    it("launches puppeteer with correct default arguments", async () => {
      await startBrowserCapture({ url: "http://localhost:3000" });

      expect(puppeteer.launch).toHaveBeenCalledOnce();
      const launchOptions = vi.mocked(puppeteer.launch).mock.calls[0][0];

      expect(launchOptions?.headless).toBe(true);
      expect(launchOptions?.args).toContain("--window-size=1280,720");
      expect(launchOptions?.args).toContain("--use-gl=swiftshader");

      expect(mockBrowser.newPage).toHaveBeenCalledOnce();
      expect(mockPage.setViewport).toHaveBeenCalledWith({
        width: 1280,
        height: 720,
        deviceScaleFactor: 1,
      });

      expect(mockPage.goto).toHaveBeenCalledWith(
        "http://localhost:3000/?popout=",
        {
          waitUntil: "networkidle0",
          timeout: 60_000,
        },
      );

      expect(mockPage.createCDPSession).toHaveBeenCalledOnce();
      expect(mockCdp.send).toHaveBeenCalledWith("Page.startScreencast", {
        format: "jpeg",
        quality: 70,
        maxWidth: 1280,
        maxHeight: 720,
        everyNthFrame: 2,
      });

      expect(isBrowserCaptureRunning()).toBe(true);
    });

    it("appends popout to hash urls", async () => {
      await startBrowserCapture({ url: "http://localhost:3000/#/stream" });
      expect(mockPage.goto).toHaveBeenCalledWith(
        "http://localhost:3000/#/stream?popout",
        expect.any(Object),
      );
    });

    it("appends popout to urls with existing hash queries", async () => {
      await startBrowserCapture({ url: "http://localhost:3000/#/stream?id=1" });
      expect(mockPage.goto).toHaveBeenCalledWith(
        "http://localhost:3000/#/stream?id=1&popout",
        expect.any(Object),
      );
    });

    it("seeds localStorage correctly", async () => {
      await startBrowserCapture({
        url: "http://localhost:3000",
        overlayLayout: "{}",
        theme: "psycho",
        avatarIndex: 2,
        destinationId: "dest123",
      });

      expect(mockPage.evaluateOnNewDocument).toHaveBeenCalledOnce();

      const _evaluateFn = mockPage.evaluateOnNewDocument.mock.calls[0][0];
      const args = mockPage.evaluateOnNewDocument.mock.calls[0].slice(1);

      expect(args).toEqual(["{}", "psycho", 2, "dest123"]);
    });

    it("prevents multiple concurrent browser instances", async () => {
      await startBrowserCapture({ url: "http://localhost:3000" });
      await startBrowserCapture({ url: "http://localhost:3000/other" });

      expect(puppeteer.launch).toHaveBeenCalledOnce();
    });

    it("processes CDP screencast frames", async () => {
      await startBrowserCapture({ url: "http://localhost:3000" });

      const screencastHandler = mockCdp.on.mock.calls.find(
        // biome-ignore lint/suspicious/noExplicitAny: needed for testing
        (call: any[]) => call[0] === "Page.screencastFrame",
      )?.[1];
      expect(screencastHandler).toBeDefined();

      const mockBuffer = Buffer.from("test-frame-data").toString("base64");

      await screencastHandler({ data: mockBuffer, sessionId: 42 });

      expect(writeFileSync).toHaveBeenCalledWith(
        FRAME_FILE,
        expect.any(Buffer),
      );
      expect(mockCdp.send).toHaveBeenCalledWith("Page.screencastFrameAck", {
        sessionId: 42,
      });
    });

    it("ignores CDP screencast frames when stopSignal is active", async () => {
      await startBrowserCapture({ url: "http://localhost:3000" });

      const screencastHandler = mockCdp.on.mock.calls.find(
        // biome-ignore lint/suspicious/noExplicitAny: needed for testing
        (call: any[]) => call[0] === "Page.screencastFrame",
      )?.[1];

      await stopBrowserCapture();

      const mockBuffer = Buffer.from("test-frame-data").toString("base64");
      await screencastHandler({ data: mockBuffer, sessionId: 42 });

      expect(writeFileSync).not.toHaveBeenCalled();
    });
  });

  describe("stopBrowserCapture", () => {
    it("closes the browser and resets state", async () => {
      await startBrowserCapture({ url: "http://localhost:3000" });
      expect(isBrowserCaptureRunning()).toBe(true);

      await stopBrowserCapture();

      expect(mockBrowser.close).toHaveBeenCalledOnce();
      expect(isBrowserCaptureRunning()).toBe(false);
    });

    it("is safe to call when not running", async () => {
      expect(isBrowserCaptureRunning()).toBe(false);
      await stopBrowserCapture();
      expect(isBrowserCaptureRunning()).toBe(false);
    });
  });

  describe("hasFrameFile", () => {
    it("checks existsSync for FRAME_FILE", () => {
      vi.mocked(existsSync).mockReturnValue(true);
      expect(hasFrameFile()).toBe(true);
      expect(existsSync).toHaveBeenCalledWith(FRAME_FILE);

      vi.mocked(existsSync).mockReturnValue(false);
      expect(hasFrameFile()).toBe(false);
    });
  });
});
