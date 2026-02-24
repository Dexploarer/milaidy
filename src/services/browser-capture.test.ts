import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  hasFrameFile,
  isBrowserCaptureRunning,
  startBrowserCapture,
  stopBrowserCapture,
} from "./browser-capture";
import puppeteer from "puppeteer-core";
import { existsSync } from "node:fs";

// Mock Puppeteer
const mockCdp = {
  on: vi.fn(),
  send: vi.fn(),
};

const mockPage = {
  setViewport: vi.fn(),
  goto: vi.fn(),
  createCDPSession: vi.fn().mockResolvedValue(mockCdp),
};

const mockBrowser = {
  newPage: vi.fn().mockResolvedValue(mockPage),
  close: vi.fn(),
};

vi.mock("puppeteer-core", () => ({
  default: {
    launch: vi.fn(),
  },
}));

vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
  writeFileSync: vi.fn(),
  // Mock os and path used in module scope
}));

vi.mock("node:os", () => ({
  tmpdir: () => "/tmp",
}));

vi.mock("node:path", () => ({
  join: (...args: string[]) => args.join("/"),
}));

describe("browser-capture", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(puppeteer.launch).mockResolvedValue(mockBrowser as any);
    // Ensure clean state
    await stopBrowserCapture();
  });

  afterEach(async () => {
    await stopBrowserCapture();
  });

  it("should start browser capture", async () => {
    expect(isBrowserCaptureRunning()).toBe(false);

    await startBrowserCapture({ url: "http://example.com" });

    expect(isBrowserCaptureRunning()).toBe(true);
    expect(puppeteer.launch).toHaveBeenCalled();
    expect(mockBrowser.newPage).toHaveBeenCalled();
    expect(mockPage.goto).toHaveBeenCalledWith(
      "http://example.com",
      expect.any(Object),
    );
    expect(mockPage.createCDPSession).toHaveBeenCalled();
    expect(mockCdp.send).toHaveBeenCalledWith(
      "Page.startScreencast",
      expect.any(Object),
    );
  });

  it("should not start if already running", async () => {
    await startBrowserCapture({ url: "http://example.com" });
    expect(puppeteer.launch).toHaveBeenCalledTimes(1);

    await startBrowserCapture({ url: "http://example.com/2" });
    expect(puppeteer.launch).toHaveBeenCalledTimes(1); // Still 1
  });

  it("should stop browser capture", async () => {
    await startBrowserCapture({ url: "http://example.com" });
    expect(isBrowserCaptureRunning()).toBe(true);

    await stopBrowserCapture();
    expect(isBrowserCaptureRunning()).toBe(false);
    expect(mockBrowser.close).toHaveBeenCalled();
  });

  it("should handle stop when not running", async () => {
    await stopBrowserCapture();
    expect(mockBrowser.close).not.toHaveBeenCalled();
  });

  it("should check if frame file exists", () => {
    vi.mocked(existsSync).mockReturnValue(true);
    expect(hasFrameFile()).toBe(true);

    vi.mocked(existsSync).mockReturnValue(false);
    expect(hasFrameFile()).toBe(false);
  });
});
