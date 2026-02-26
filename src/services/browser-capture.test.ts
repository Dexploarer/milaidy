import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, writeFileSync } from "node:fs";

// Mock dependencies
vi.mock("node:fs", () => ({
  writeFileSync: vi.fn(),
  existsSync: vi.fn(),
}));

vi.mock("node:os", () => ({
  tmpdir: () => "/tmp",
}));

const mockCDPSession = {
  on: vi.fn(),
  send: vi.fn(),
};

const mockPage = {
  setViewport: vi.fn(),
  goto: vi.fn(),
  createCDPSession: vi.fn().mockResolvedValue(mockCDPSession),
};

const mockBrowser = {
  newPage: vi.fn().mockResolvedValue(mockPage),
  close: vi.fn(),
};

const mockLaunch = vi.fn().mockResolvedValue(mockBrowser);

vi.mock("puppeteer-core", () => ({
  default: {
    launch: mockLaunch,
  },
}));

import {
  startBrowserCapture,
  stopBrowserCapture,
  isBrowserCaptureRunning,
  hasFrameFile,
  FRAME_FILE,
} from "./browser-capture";

describe("browser-capture", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await stopBrowserCapture();
  });

  it("should start browser capture", async () => {
    await startBrowserCapture({ url: "http://example.com" });
    expect(mockLaunch).toHaveBeenCalledWith(expect.objectContaining({
      headless: true,
      args: expect.arrayContaining(["--no-sandbox", "--disable-gpu"]),
    }));
    expect(mockBrowser.newPage).toHaveBeenCalled();
    expect(mockPage.goto).toHaveBeenCalledWith("http://example.com", expect.objectContaining({ waitUntil: "domcontentloaded" }));
    expect(mockPage.createCDPSession).toHaveBeenCalled();
    expect(mockCDPSession.send).toHaveBeenCalledWith("Page.startScreencast", expect.objectContaining({
      format: "jpeg",
      quality: 70,
    }));
    expect(isBrowserCaptureRunning()).toBe(true);
  });

  it("should not start if already running", async () => {
    await startBrowserCapture({ url: "http://example.com" });
    mockLaunch.mockClear();
    await startBrowserCapture({ url: "http://example.com" });
    expect(mockLaunch).not.toHaveBeenCalled();
  });

  it("should handle screencast frames", async () => {
    await startBrowserCapture({ url: "http://example.com" });

    // Simulate frame event
    // The implementation uses: cdp.on("Page.screencastFrame", ...)
    const onCall = mockCDPSession.on.mock.calls.find((call: any[]) => call[0] === "Page.screencastFrame");
    expect(onCall).toBeDefined();

    const onCallback = onCall[1];
    const frameData = { data: Buffer.from("test-image-data").toString("base64"), sessionId: 123 };
    await onCallback(frameData);

    expect(writeFileSync).toHaveBeenCalledWith(FRAME_FILE, expect.any(Buffer));
    expect(mockCDPSession.send).toHaveBeenCalledWith("Page.screencastFrameAck", { sessionId: 123 });
  });

  it("should stop browser capture", async () => {
    await startBrowserCapture({ url: "http://example.com" });
    await stopBrowserCapture();
    expect(mockBrowser.close).toHaveBeenCalled();
    expect(isBrowserCaptureRunning()).toBe(false);
  });

  it("should check if frame file exists", () => {
    vi.mocked(existsSync).mockReturnValue(true);
    expect(hasFrameFile()).toBe(true);
    expect(existsSync).toHaveBeenCalledWith(FRAME_FILE);

    vi.mocked(existsSync).mockReturnValue(false);
    expect(hasFrameFile()).toBe(false);
  });
});
