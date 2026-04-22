import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { startBrowserCapture, stopBrowserCapture, isBrowserCaptureRunning, hasFrameFile, FRAME_FILE } from "./browser-capture.js";
import puppeteer from "puppeteer-core";
import { existsSync, writeFileSync } from "node:fs";

vi.mock("puppeteer-core", () => ({
    default: {
        launch: vi.fn()
    }
}));

vi.mock("node:fs", () => ({
    existsSync: vi.fn(),
    writeFileSync: vi.fn()
}));

describe("BrowserCapture", () => {
    let mockBrowser: any;
    let mockPage: any;
    let mockCdp: any;

    beforeEach(() => {
        vi.clearAllMocks();

        mockCdp = {
            on: vi.fn(),
            send: vi.fn().mockResolvedValue(undefined)
        };

        mockPage = {
            goto: vi.fn(),
            setViewport: vi.fn(),
            evaluateOnNewDocument: vi.fn(),
            createCDPSession: vi.fn().mockResolvedValue(mockCdp),
        };

        mockBrowser = {
            newPage: vi.fn().mockResolvedValue(mockPage),
            close: vi.fn()
        };

        vi.mocked(puppeteer.launch).mockResolvedValue(mockBrowser);
    });

    afterEach(async () => {
        await stopBrowserCapture();
    });

    describe("startBrowserCapture", () => {
        it("should launch browser with correct args and navigate", async () => {
            const config = {
                url: "https://example.com",
                width: 1920,
                height: 1080,
                quality: 80,
                theme: "milady",
                avatarIndex: 5,
                destinationId: "dest-1",
                overlayLayout: "{}"
            };

            await startBrowserCapture(config);

            expect(puppeteer.launch).toHaveBeenCalledWith(expect.objectContaining({
                headless: true,
                args: expect.arrayContaining([
                    "--window-size=1920,1080",
                    "--use-gl=swiftshader"
                ])
            }));

            expect(mockPage.setViewport).toHaveBeenCalledWith({ width: 1920, height: 1080, deviceScaleFactor: 1 });
            expect(mockPage.evaluateOnNewDocument).toHaveBeenCalled();
            expect(mockPage.goto).toHaveBeenCalledWith("https://example.com/?popout=", { waitUntil: "networkidle0", timeout: 60000 });
            expect(mockPage.createCDPSession).toHaveBeenCalled();

            expect(mockCdp.on).toHaveBeenCalledWith("Page.screencastFrame", expect.any(Function));
            expect(mockCdp.send).toHaveBeenCalledWith("Page.startScreencast", {
                format: "jpeg",
                quality: 80,
                maxWidth: 1920,
                maxHeight: 1080,
                everyNthFrame: 2
            });

            expect(isBrowserCaptureRunning()).toBe(true);
        });

        it("should handle existing popout parameter in URL correctly", async () => {
             const config = {
                url: "https://example.com/#/stream?popout"
            };

            await startBrowserCapture(config);

            expect(mockPage.goto).toHaveBeenCalledWith("https://example.com/#/stream?popout", expect.anything());
        });

        it("should return early if already running", async () => {
             await startBrowserCapture({ url: "https://example.com" });
             expect(puppeteer.launch).toHaveBeenCalledTimes(1);

             await startBrowserCapture({ url: "https://example.com" });
             expect(puppeteer.launch).toHaveBeenCalledTimes(1); // not called again
        });

        it("should write screencast frames to file", async () => {
             await startBrowserCapture({ url: "https://example.com" });

             // Get the registered callback
             const callback = mockCdp.on.mock.calls.find((call: any[]) => call[0] === "Page.screencastFrame")[1];

             // Simulate a frame event
             await callback({ data: Buffer.from("test").toString("base64"), sessionId: 123 });

             expect(writeFileSync).toHaveBeenCalledWith(FRAME_FILE, expect.any(Buffer));
             expect(mockCdp.send).toHaveBeenCalledWith("Page.screencastFrameAck", { sessionId: 123 });
        });
    });

    describe("stopBrowserCapture", () => {
        it("should close browser and reset state", async () => {
             await startBrowserCapture({ url: "https://example.com" });
             expect(isBrowserCaptureRunning()).toBe(true);

             await stopBrowserCapture();

             expect(mockBrowser.close).toHaveBeenCalled();
             expect(isBrowserCaptureRunning()).toBe(false);
        });

        it("should handle error during browser close", async () => {
            await startBrowserCapture({ url: "https://example.com" });
            mockBrowser.close.mockRejectedValueOnce(new Error("Close failed"));

            await stopBrowserCapture();

            expect(isBrowserCaptureRunning()).toBe(false);
        });
    });

    describe("hasFrameFile", () => {
        it("should check if frame file exists", () => {
             vi.mocked(existsSync).mockReturnValue(true);
             expect(hasFrameFile()).toBe(true);
             expect(existsSync).toHaveBeenCalledWith(FRAME_FILE);
        });
    });
});
