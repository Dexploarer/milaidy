/**
 * Unit tests for whatsapp-pairing.ts — account ID sanitization, auth existence
 * checks, and WhatsAppPairingSession lifecycle without requiring Baileys.
 *
 * The start() and whatsappLogout() methods depend on @whiskeysockets/baileys,
 * qrcode, pino, and @hapi/boom — tested via integration tests, not here.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  sanitizeAccountId,
  type WhatsAppPairingEvent,
  WhatsAppPairingSession,
  whatsappAuthExists,
  whatsappLogout,
} from "./whatsapp-pairing";

// Mock external modules dynamically imported
vi.mock("@whiskeysockets/baileys", () => {
  return {
    default: vi.fn(),
    useMultiFileAuthState: vi.fn(),
    fetchLatestBaileysVersion: vi.fn().mockResolvedValue({ version: "1.0.0" }),
    DisconnectReason: {
      loggedOut: 401,
      restartRequired: 415,
      timedOut: 408,
      connectionClosed: 428,
      connectionReplaced: 440,
    },
  };
});

vi.mock("qrcode", () => ({
  default: {
    toDataURL: vi.fn().mockResolvedValue("data:image/png;base64,mock"),
  },
}));

vi.mock("@hapi/boom", () => ({
  Boom: class Boom extends Error {
    output: { statusCode: number };
    constructor(message: string, statusCode: number) {
      super(message);
      this.output = { statusCode };
    }
  },
}));

vi.mock("pino", () => ({
  default: vi.fn().mockReturnValue({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
  }),
}));

// ═════════════════════════════════════════════════════════════════════════
describe("whatsapp-pairing", () => {
  // ── sanitizeAccountId ──────────────────────────────────────────────
  describe("sanitizeAccountId", () => {
    it("accepts alphanumeric ID", () => {
      expect(sanitizeAccountId("myAccount123")).toBe("myAccount123");
    });

    it("accepts dashes and underscores", () => {
      expect(sanitizeAccountId("my-account_01")).toBe("my-account_01");
    });

    it("accepts single character", () => {
      expect(sanitizeAccountId("a")).toBe("a");
    });

    it("rejects empty string", () => {
      expect(() => sanitizeAccountId("")).toThrow("Invalid accountId");
    });

    it("rejects path traversal (..) ", () => {
      expect(() => sanitizeAccountId("../../../etc/passwd")).toThrow(
        "Invalid accountId",
      );
    });

    it("rejects dots", () => {
      expect(() => sanitizeAccountId("account.name")).toThrow(
        "Invalid accountId",
      );
    });

    it("rejects slashes", () => {
      expect(() => sanitizeAccountId("path/to/dir")).toThrow(
        "Invalid accountId",
      );
    });

    it("rejects backslashes", () => {
      expect(() => sanitizeAccountId("path\\to\\dir")).toThrow(
        "Invalid accountId",
      );
    });

    it("rejects spaces", () => {
      expect(() => sanitizeAccountId("has space")).toThrow("Invalid accountId");
    });

    it("rejects special characters", () => {
      expect(() => sanitizeAccountId("inject;rm -rf")).toThrow(
        "Invalid accountId",
      );
    });

    it("rejects null byte injection", () => {
      expect(() => sanitizeAccountId("safe\x00evil")).toThrow(
        "Invalid accountId",
      );
    });

    it("rejects unicode characters", () => {
      expect(() => sanitizeAccountId("café")).toThrow("Invalid accountId");
    });
  });

  // ── whatsappAuthExists ─────────────────────────────────────────────
  describe("whatsappAuthExists", () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wa-test-"));
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it("returns false when no auth directory exists", () => {
      expect(whatsappAuthExists(tmpDir)).toBe(false);
    });

    it("returns false when dir exists but creds.json is missing", () => {
      fs.mkdirSync(path.join(tmpDir, "whatsapp-auth", "default"), {
        recursive: true,
      });
      expect(whatsappAuthExists(tmpDir)).toBe(false);
    });

    it("returns true when creds.json exists", () => {
      const credsDir = path.join(tmpDir, "whatsapp-auth", "default");
      fs.mkdirSync(credsDir, { recursive: true });
      fs.writeFileSync(path.join(credsDir, "creds.json"), "{}");
      expect(whatsappAuthExists(tmpDir)).toBe(true);
    });

    it("uses default accountId when not specified", () => {
      const credsDir = path.join(tmpDir, "whatsapp-auth", "default");
      fs.mkdirSync(credsDir, { recursive: true });
      fs.writeFileSync(path.join(credsDir, "creds.json"), "{}");
      expect(whatsappAuthExists(tmpDir)).toBe(true);
    });

    it("respects custom accountId", () => {
      const credsDir = path.join(tmpDir, "whatsapp-auth", "business");
      fs.mkdirSync(credsDir, { recursive: true });
      fs.writeFileSync(path.join(credsDir, "creds.json"), "{}");
      expect(whatsappAuthExists(tmpDir, "business")).toBe(true);
      expect(whatsappAuthExists(tmpDir, "personal")).toBe(false);
    });
  });

  // ── WhatsAppPairingSession ─────────────────────────────────────────
  describe("WhatsAppPairingSession", () => {
    let events: WhatsAppPairingEvent[];
    let session: WhatsAppPairingSession;
    let tmpDir: string;
    let mockSocket: any;

    beforeEach(async () => {
      events = [];
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wa-test-session-"));
      session = new WhatsAppPairingSession({
        authDir: path.join(tmpDir, "auth"),
        accountId: "test-account",
        onEvent: (e) => events.push(e),
      });

      mockSocket = {
        ev: {
          on: vi.fn(),
          removeAllListeners: vi.fn(),
        },
        end: vi.fn(),
        logout: vi.fn(),
        user: { id: "1234567890:1" },
      };

      const baileys = await import("@whiskeysockets/baileys");
      vi.mocked(baileys.default).mockReturnValue(mockSocket);
      vi.mocked(baileys.useMultiFileAuthState).mockResolvedValue({
        state: {} as any,
        saveCreds: vi.fn(),
      });
    });

    afterEach(() => {
      session.stop();
      fs.rmSync(tmpDir, { recursive: true, force: true });
      vi.clearAllMocks();
      vi.useRealTimers();
    });

    it("starts in idle state", () => {
      expect(session.getStatus()).toBe("idle");
    });

    it("stop() is safe to call before start()", () => {
      // Should not throw even though socket is null
      expect(() => session.stop()).not.toThrow();
    });

    it("stop() can be called multiple times", () => {
      session.stop();
      session.stop();
      expect(session.getStatus()).toBe("idle");
    });

    it("start() initializes socket and sets status to initializing", async () => {
      await session.start();
      expect(session.getStatus()).toBe("initializing");
      expect(mockSocket.ev.on).toHaveBeenCalledWith(
        "creds.update",
        expect.any(Function),
      );
      expect(mockSocket.ev.on).toHaveBeenCalledWith(
        "connection.update",
        expect.any(Function),
      );
    });

    it("handles connection open event", async () => {
      await session.start();
      const connectionHandler = mockSocket.ev.on.mock.calls.find(
        (call: any[]) => call[0] === "connection.update",
      )[1];

      await connectionHandler({ connection: "open" });

      expect(session.getStatus()).toBe("connected");
      expect(events).toContainEqual(
        expect.objectContaining({
          type: "whatsapp-status",
          status: "connected",
          phoneNumber: "1234567890",
        }),
      );
    });

    it("handles QR code event", async () => {
      await session.start();
      const connectionHandler = mockSocket.ev.on.mock.calls.find(
        (call: any[]) => call[0] === "connection.update",
      )[1];

      await connectionHandler({ qr: "test-qr-data" });

      expect(session.getStatus()).toBe("waiting_for_qr");
      expect(events).toContainEqual(
        expect.objectContaining({
          type: "whatsapp-qr",
          qrDataUrl: "data:image/png;base64,mock",
        }),
      );
    });

    it("stops after max QR attempts", async () => {
      await session.start();
      const connectionHandler = mockSocket.ev.on.mock.calls.find(
        (call: any[]) => call[0] === "connection.update",
      )[1];

      for (let i = 0; i < 6; i++) {
        await connectionHandler({ qr: "test-qr-data" });
      }

      expect(session.getStatus()).toBe("timeout");
    });

    it("handles logged out connection close", async () => {
      await session.start();
      const connectionHandler = mockSocket.ev.on.mock.calls.find(
        (call: any[]) => call[0] === "connection.update",
      )[1];

      const { Boom } = await import("@hapi/boom");
      const error = new Boom("Logged out", 401);

      await connectionHandler({
        connection: "close",
        lastDisconnect: { error },
      });

      expect(session.getStatus()).toBe("disconnected");
    });

    it("restarts on transient disconnect reason", async () => {
      vi.useFakeTimers();
      await session.start();

      const connectionHandler = mockSocket.ev.on.mock.calls.find(
        (call: any[]) => call[0] === "connection.update",
      )[1];

      const { Boom } = await import("@hapi/boom");
      const error = new Boom("Restart required", 415);

      await connectionHandler({
        connection: "close",
        lastDisconnect: { error },
      });

      // Should not be disconnected
      expect(session.getStatus()).toBe("initializing");

      // Fast forward the 3000ms timer and resolve promises
      await vi.advanceTimersByTimeAsync(3000);

      expect(mockSocket.ev.on).toHaveBeenCalledTimes(4); // 2 from first start, 2 from second start
    });
  });

  // ── whatsappLogout ─────────────────────────────────────────────────
  describe("whatsappLogout", () => {
    let tmpDir: string;
    let mockSocket: any;

    beforeEach(async () => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wa-test-logout-"));

      mockSocket = {
        ev: {
          on: vi.fn(),
          removeAllListeners: vi.fn(),
        },
        end: vi.fn(),
        logout: vi.fn().mockResolvedValue(undefined),
      };

      const baileys = await import("@whiskeysockets/baileys");
      vi.mocked(baileys.default).mockReturnValue(mockSocket);
      vi.mocked(baileys.useMultiFileAuthState).mockResolvedValue({
        state: {} as any,
        saveCreds: vi.fn(),
      });
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      vi.clearAllMocks();
    });

    it("deletes auth dir when it exists but connection fails", async () => {
      const credsDir = path.join(tmpDir, "whatsapp-auth", "default");
      fs.mkdirSync(credsDir, { recursive: true });
      fs.writeFileSync(path.join(credsDir, "creds.json"), "{}");

      mockSocket.ev.on.mockImplementation((event: string, cb: any) => {
        if (event === "connection.update") {
          setTimeout(() => cb({ connection: "close" }), 0);
        }
      });

      await whatsappLogout(tmpDir);

      expect(fs.existsSync(credsDir)).toBe(false);
    });

    it("logs out and deletes auth dir on successful connection", async () => {
      const credsDir = path.join(tmpDir, "whatsapp-auth", "default");
      fs.mkdirSync(credsDir, { recursive: true });
      fs.writeFileSync(path.join(credsDir, "creds.json"), "{}");

      mockSocket.ev.on.mockImplementation((event: string, cb: any) => {
        if (event === "connection.update") {
          setTimeout(() => cb({ connection: "open" }), 0);
        }
      });

      await whatsappLogout(tmpDir);

      expect(mockSocket.logout).toHaveBeenCalled();
      expect(fs.existsSync(credsDir)).toBe(false);
    });

    it("does nothing and doesn't connect if auth dir doesn't exist", async () => {
      await whatsappLogout(tmpDir);

      const baileys = await import("@whiskeysockets/baileys");
      expect(baileys.default).not.toHaveBeenCalled();
    });
  });
});
