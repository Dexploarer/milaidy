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

vi.mock("puppeteer-core", () => ({
  default: {
    launch: vi.fn(),
  },
}));

describe("browser-capture", () => {
  let mockBrowser: unknown;
  let mockPage: unknown;
  let mockCdpSession: unknown;

  beforeEach(() => {
    vi.clearAllMocks();

    mockCdpSession = {
      on: vi.fn(),
      send: vi.fn().mockResolvedValue(undefined),
    };

    mockPage = {
      setViewport: vi.fn().mockResolvedValue(undefined),
      evaluateOnNewDocument: vi.fn().mockResolvedValue(undefined),
      goto: vi.fn().mockResolvedValue(undefined),
      createCDPSession: vi.fn().mockResolvedValue(mockCdpSession),
    };

    mockBrowser = {
      newPage: vi.fn().mockResolvedValue(mockPage),
      close: vi.fn().mockResolvedValue(undefined),
    };

    vi.mocked(puppeteer.launch).mockResolvedValue(mockBrowser);
  });

  afterEach(async () => {
    await stopBrowserCapture();
  });

  it("should report correctly if running or frame file exists", () => {
    vi.mocked(existsSync).mockReturnValue(true);
    expect(hasFrameFile()).toBe(true);

    vi.mocked(existsSync).mockReturnValue(false);
    expect(hasFrameFile()).toBe(false);

    expect(isBrowserCaptureRunning()).toBe(false);
  });

  it("should launch headless Chrome with correct args and popout URL", async () => {
    await startBrowserCapture({
      url: "https://example.com/stream",
      width: 800,
      height: 600,
      theme: "haxor",
      avatarIndex: 3,
    });

    expect(isBrowserCaptureRunning()).toBe(true);

    expect(puppeteer.launch).toHaveBeenCalledWith(
      expect.objectContaining({
        headless: true,
        args: expect.arrayContaining([
          "--window-size=800,600",
          "--use-gl=swiftshader",
        ]),
      }),
    );

    expect(mockPage.setViewport).toHaveBeenCalledWith({
      width: 800,
      height: 600,
      deviceScaleFactor: 1,
    });

    // Test that popout is appended
    expect(mockPage.goto).toHaveBeenCalledWith(
      "https://example.com/stream?popout=",
      expect.anything(),
    );

    expect(mockPage.evaluateOnNewDocument).toHaveBeenCalledWith(
      expect.any(Function),
      undefined,
      "haxor",
      3,
      undefined,
    );

    expect(mockCdpSession.send).toHaveBeenCalledWith(
      "Page.startScreencast",
      expect.objectContaining({
        format: "jpeg",
        maxWidth: 800,
        maxHeight: 600,
      }),
    );
  });

  it("should stop browser capture", async () => {
    await startBrowserCapture({ url: "https://example.com" });
    expect(isBrowserCaptureRunning()).toBe(true);

    await stopBrowserCapture();
    expect(mockBrowser.close).toHaveBeenCalled();
    expect(isBrowserCaptureRunning()).toBe(false);
  });

  it("should not start again if already running", async () => {
    await startBrowserCapture({ url: "https://example.com" });
    const calls = vi.mocked(puppeteer.launch).mock.calls.length;

    await startBrowserCapture({ url: "https://example.com" });
    expect(vi.mocked(puppeteer.launch).mock.calls.length).toBe(calls); // No new launch
  });

  it("should write frame from CDP screencast event", async () => {
    await startBrowserCapture({ url: "https://example.com" });

    // Find the registered screencast callback
    const screencastCallback = mockCdpSession.on.mock.calls.find(
      (call: unknown[]) => call[0] === "Page.screencastFrame",
    )?.[1];

    expect(screencastCallback).toBeDefined();

    const mockData = "base64data";
    const buf = Buffer.from(mockData, "base64");

    await screencastCallback({ data: mockData, sessionId: 123 });

    expect(writeFileSync).toHaveBeenCalledWith(FRAME_FILE, buf);
    expect(mockCdpSession.send).toHaveBeenCalledWith(
      "Page.screencastFrameAck",
      { sessionId: 123 },
    );
  });
});
