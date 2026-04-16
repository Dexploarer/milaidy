import fs from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { WhatsAppPairingSession } from "../services/whatsapp-pairing";
import {
  applyWhatsAppQrOverride,
  handleWhatsAppRoute,
  type WhatsAppRouteState,
} from "./whatsapp-routes";

vi.mock("node:fs");
vi.mock("../services/whatsapp-pairing", async () => {
  const actual = await vi.importActual("../services/whatsapp-pairing");
  return {
    ...actual,
    whatsappAuthExists: vi.fn(() => false),
    whatsappLogout: vi.fn(async () => {}),
    WhatsAppPairingSession: vi.fn().mockImplementation(() => ({
      start: vi.fn(async () => {}),
      stop: vi.fn(),
      getStatus: vi.fn(() => "connecting"),
    })),
  };
});

// A lightweight mock to simulate stream payloads
function mockReqRes(
  method: string,
  pathname: string,
  bodyObj: Record<string, unknown> | null = null,
) {
  const req = {
    method,
    url: pathname,
    headers: { host: "localhost" },
    on: vi.fn((event, cb) => {
      if (event === "data" && bodyObj) {
        cb(Buffer.from(JSON.stringify(bodyObj)));
      }
      if (event === "end") {
        cb();
      }
      return req;
    }),
    off: vi.fn(),
    removeListener: vi.fn(),
    once: vi.fn((event, cb) => {
      if (event === "data" && bodyObj) {
        cb(Buffer.from(JSON.stringify(bodyObj)));
      }
      if (event === "end") {
        cb();
      }
      return req;
    }),
    emit: vi.fn(),
  } as unknown as IncomingMessage;

  const res = {
    statusCode: 200,
    setHeader: vi.fn(),
    end: vi.fn(),
  } as unknown as ServerResponse;

  return { req, res };
}

describe("whatsapp-routes", () => {
  let state: WhatsAppRouteState;

  beforeEach(() => {
    vi.clearAllMocks();
    state = {
      whatsappPairingSessions: new Map(),
      config: { connectors: {} },
      saveConfig: vi.fn(),
      workspaceDir: "/tmp/workspace",
      broadcastWs: vi.fn(),
    };
  });

  describe("handleWhatsAppRoute", () => {
    test("ignores non-whatsapp routes", async () => {
      const { req, res } = mockReqRes("GET", "/api/other");
      const handled = await handleWhatsAppRoute(
        req,
        res,
        "/api/other",
        "GET",
        state,
      );
      expect(handled).toBe(false);
    });

    test("POST /api/whatsapp/pair handles valid payload", async () => {
      const { req, res } = mockReqRes("POST", "/api/whatsapp/pair", {
        accountId: "test-acc",
      });

      const handled = await handleWhatsAppRoute(
        req,
        res,
        "/api/whatsapp/pair",
        "POST",
        state,
      );
      expect(handled).toBe(true);
      expect(res.statusCode).toBe(200);

      const resBody = JSON.parse(vi.mocked(res.end).mock.calls[0][0] as string);
      expect(resBody).toEqual({
        ok: true,
        accountId: "test-acc",
        status: "connecting",
      });
      expect(state.whatsappPairingSessions.has("test-acc")).toBe(true);

      // trigger the event handler callback to test config state changes
      const sessionConfig = vi.mocked(WhatsAppPairingSession).mock.calls[0][0];
      sessionConfig.onEvent({ status: "connected" });
      expect(state.config.connectors?.whatsapp).toMatchObject({
        enabled: true,
        authDir: "/tmp/workspace/whatsapp-auth/test-acc",
      });
      expect(state.saveConfig).toHaveBeenCalled();
      expect(state.broadcastWs).toHaveBeenCalledWith({ status: "connected" });
    });

    test("POST /api/whatsapp/pair handles invalid account ID gracefully", async () => {
      const { req, res } = mockReqRes("POST", "/api/whatsapp/pair", {
        accountId: "../invalid",
      });
      const handled = await handleWhatsAppRoute(
        req,
        res,
        "/api/whatsapp/pair",
        "POST",
        state,
      );
      expect(handled).toBe(true);
      expect(res.statusCode).toBe(400);
    });

    test("POST /api/whatsapp/pair rejects when max sessions reached", async () => {
      // fill up sessions
      for (let i = 0; i < 10; i++) {
        state.whatsappPairingSessions.set(
          `acc-${i}`,
          {} as unknown as WhatsAppPairingSession,
        );
      }

      const { req, res } = mockReqRes("POST", "/api/whatsapp/pair", {
        accountId: "new-acc",
      });
      const handled = await handleWhatsAppRoute(
        req,
        res,
        "/api/whatsapp/pair",
        "POST",
        state,
      );
      expect(handled).toBe(true);
      expect(res.statusCode).toBe(429);
    });

    test("GET /api/whatsapp/status handles status retrieval", async () => {
      const { req, res } = mockReqRes(
        "GET",
        "/api/whatsapp/status?accountId=test-acc",
      );
      state.whatsappPairingSessions.set("test-acc", {
        getStatus: () => "pairing",
      } as unknown as WhatsAppPairingSession);

      state.runtime = {
        getService: vi.fn(() => ({
          connected: true,
          phoneNumber: "12345",
        })),
      };

      const handled = await handleWhatsAppRoute(
        req,
        res,
        "/api/whatsapp/status",
        "GET",
        state,
      );
      expect(handled).toBe(true);

      const resBody = JSON.parse(vi.mocked(res.end).mock.calls[0][0] as string);
      expect(resBody).toMatchObject({
        accountId: "test-acc",
        status: "pairing",
        serviceConnected: true,
        servicePhone: "12345",
      });
    });

    test("POST /api/whatsapp/pair/stop handles stopping session", async () => {
      const stopFn = vi.fn();
      state.whatsappPairingSessions.set("test-acc", {
        stop: stopFn,
      } as unknown as WhatsAppPairingSession);

      const { req, res } = mockReqRes("POST", "/api/whatsapp/pair/stop", {
        accountId: "test-acc",
      });

      const handled = await handleWhatsAppRoute(
        req,
        res,
        "/api/whatsapp/pair/stop",
        "POST",
        state,
      );
      expect(handled).toBe(true);
      expect(stopFn).toHaveBeenCalled();
      expect(state.whatsappPairingSessions.has("test-acc")).toBe(false);
    });

    test("POST /api/whatsapp/disconnect handles clean disconnect", async () => {
      const stopFn = vi.fn();
      state.whatsappPairingSessions.set("test-acc", {
        stop: stopFn,
      } as unknown as WhatsAppPairingSession);
      state.config.connectors = { whatsapp: { enabled: true } };

      const { req, res } = mockReqRes("POST", "/api/whatsapp/disconnect", {
        accountId: "test-acc",
      });

      const handled = await handleWhatsAppRoute(
        req,
        res,
        "/api/whatsapp/disconnect",
        "POST",
        state,
      );

      expect(handled).toBe(true);
      expect(stopFn).toHaveBeenCalled();
      expect(state.config.connectors.whatsapp).toBeUndefined();
      expect(state.saveConfig).toHaveBeenCalled();
      const resBody = JSON.parse(vi.mocked(res.end).mock.calls[0][0] as string);
      expect(resBody).toEqual({ ok: true, accountId: "test-acc" });
    });
  });

  describe("applyWhatsAppQrOverride", () => {
    test("modifies plugin config if creds.json exists", () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      const plugins = [
        { id: "whatsapp", validationErrors: ["error"], configured: false },
        { id: "other", validationErrors: ["error"], configured: false },
      ];
      applyWhatsAppQrOverride(plugins, "/tmp/workspace");

      expect(plugins[0].configured).toBe(true);
      expect(plugins[0].validationErrors).toEqual([]);
      expect((plugins[0] as Record<string, unknown>).qrConnected).toBe(true);
      expect(plugins[1].configured).toBe(false); // Should not affect other
    });

    test("does nothing if creds.json does not exist", () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      const plugins = [
        { id: "whatsapp", validationErrors: ["error"], configured: false },
      ];
      applyWhatsAppQrOverride(plugins, "/tmp/workspace");

      expect(plugins[0].configured).toBe(false);
      expect(plugins[0].validationErrors).toEqual(["error"]);
    });
  });
});
