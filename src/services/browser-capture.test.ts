import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  startBrowserCapture,
  stopBrowserCapture,
  isBrowserCaptureRunning,
  hasFrameFile,
  FRAME_FILE
} from './browser-capture';
import puppeteer from 'puppeteer-core';
import * as fs from 'node:fs';

vi.mock('puppeteer-core');
vi.mock('node:fs', () => {
  return {
    writeFileSync: vi.fn(),
    existsSync: vi.fn(),
  };
});

describe('Browser Capture Service', () => {
  let mockPage: any;
  let mockCdp: any;
  let mockBrowser: any;

  beforeEach(() => {
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

    vi.mocked(puppeteer.launch).mockResolvedValue(mockBrowser as any);
  });

  afterEach(async () => {
    vi.clearAllMocks();
    await stopBrowserCapture();
  });

  it('should start browser capture with correct parameters', async () => {
    const config = {
      url: 'http://localhost:3000/stream',
      width: 1920,
      height: 1080,
      quality: 80,
      overlayLayout: '{"test":true}',
      theme: 'haxor',
      avatarIndex: 2,
      destinationId: 'dest-1'
    };

    await startBrowserCapture(config);

    expect(puppeteer.launch).toHaveBeenCalledWith(expect.objectContaining({
      headless: true,
      args: expect.arrayContaining([
        '--window-size=1920,1080',
        '--no-sandbox',
        '--use-gl=swiftshader',
      ]),
    }));

    expect(mockPage.setViewport).toHaveBeenCalledWith({
      width: 1920,
      height: 1080,
      deviceScaleFactor: 1
    });

    expect(mockPage.evaluateOnNewDocument).toHaveBeenCalledWith(
      expect.any(Function),
      '{"test":true}',
      'haxor',
      2,
      'dest-1'
    );

    // Should append popout
    expect(mockPage.goto).toHaveBeenCalledWith('http://localhost:3000/stream?popout=', expect.objectContaining({
      waitUntil: 'networkidle0'
    }));

    expect(mockCdp.send).toHaveBeenCalledWith('Page.startScreencast', {
      format: 'jpeg',
      quality: 80,
      maxWidth: 1920,
      maxHeight: 1080,
      everyNthFrame: 2,
    });

    expect(isBrowserCaptureRunning()).toBe(true);
  });

  it('should not start a second instance if already running', async () => {
    await startBrowserCapture({ url: 'http://localhost' });
    expect(puppeteer.launch).toHaveBeenCalledTimes(1);

    await startBrowserCapture({ url: 'http://localhost' });
    expect(puppeteer.launch).toHaveBeenCalledTimes(1); // Still 1
  });

  it('should handle URL popout logic correctly', async () => {
    await startBrowserCapture({ url: 'http://localhost:3000/stream#view?' });
    expect(mockPage.goto).toHaveBeenCalledWith('http://localhost:3000/stream#view?&popout', expect.any(Object));
  });

  it('should handle screencast frames correctly', async () => {
    await startBrowserCapture({ url: 'http://localhost' });

    // Simulate frame
    const onCall = mockCdp.on.mock.calls.find((call: any) => call[0] === 'Page.screencastFrame');
    expect(onCall).toBeDefined();

    const handler = onCall[1];

    await handler({
      data: Buffer.from('test frame').toString('base64'),
      sessionId: 123
    });

    expect(vi.mocked(fs.writeFileSync)).toHaveBeenCalledWith(FRAME_FILE, expect.any(Buffer));
    expect(mockCdp.send).toHaveBeenCalledWith('Page.screencastFrameAck', { sessionId: 123 });
  });

  it('should stop capture correctly', async () => {
    await startBrowserCapture({ url: 'http://localhost' });
    expect(isBrowserCaptureRunning()).toBe(true);

    await stopBrowserCapture();
    expect(mockBrowser.close).toHaveBeenCalled();
    expect(isBrowserCaptureRunning()).toBe(false);
  });

  it('hasFrameFile should return true if file exists', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    expect(hasFrameFile()).toBe(true);
    expect(vi.mocked(fs.existsSync)).toHaveBeenCalledWith(FRAME_FILE);
  });
});
