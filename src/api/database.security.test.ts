import { EventEmitter } from "node:events";
import type http from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const loadMilaidyConfigMock = vi.fn();
const saveMilaidyConfigMock = vi.fn();

vi.mock("../config/config.js", () => ({
  loadMilaidyConfig: () => loadMilaidyConfigMock(),
  saveMilaidyConfig: (cfg: unknown) => saveMilaidyConfigMock(cfg),
}));

import { handleDatabaseRoute } from "./database.js";

function createMockRequest(
  method: string,
  url: string,
  body: unknown,
): http.IncomingMessage & EventEmitter {
  const req = new EventEmitter() as http.IncomingMessage &
    EventEmitter & { destroy: () => void };
  req.method = method;
  req.url = url;
  req.headers = { host: "localhost:2138" };
  req.destroy = vi.fn();

  const encoded = Buffer.from(JSON.stringify(body), "utf-8");
  queueMicrotask(() => req.emit("data", encoded));
  queueMicrotask(() => req.emit("end"));
  return req;
}

function createMockResponse(): {
  res: http.ServerResponse;
  getStatus: () => number;
  getJson: () => unknown;
} {
  let statusCode = 200;
  let payload = "";

  const res = {
    set statusCode(value: number) {
      statusCode = value;
    },
    get statusCode() {
      return statusCode;
    },
    setHeader: () => undefined,
    end: (chunk?: string | Buffer) => {
      payload = chunk ? chunk.toString() : "";
    },
  } as unknown as http.ServerResponse;

  return {
    res,
    getStatus: () => statusCode,
    getJson: () => (payload ? JSON.parse(payload) : null),
  };
}

describe("database API security hardening", () => {
  const prevBind = process.env.MILAIDY_API_BIND;

  beforeEach(() => {
    process.env.MILAIDY_API_BIND = "0.0.0.0";
    loadMilaidyConfigMock.mockReturnValue({
      database: { provider: "postgres", postgres: { host: "8.8.8.8" } },
    });
    saveMilaidyConfigMock.mockReset();
  });

  afterEach(() => {
    if (prevBind === undefined) {
      delete process.env.MILAIDY_API_BIND;
    } else {
      process.env.MILAIDY_API_BIND = prevBind;
    }
    vi.clearAllMocks();
  });

  it("validates postgres host even when provider is omitted", async () => {
    const req = createMockRequest("PUT", "/api/database/config", {
      postgres: { host: "169.254.169.254" },
    });
    const { res, getStatus, getJson } = createMockResponse();

    const handled = await handleDatabaseRoute(
      req,
      res,
      null,
      "/api/database/config",
    );

    expect(handled).toBe(true);
    expect(getStatus()).toBe(400);
    expect(getJson()).toEqual({
      error:
        'Connection to "169.254.169.254" is blocked: link-local and metadata addresses are not allowed.',
    });
    expect(saveMilaidyConfigMock).not.toHaveBeenCalled();
  });

  it("rejects unresolved hostnames to prevent DNS rebinding TOCTOU", async () => {
    const req = createMockRequest("PUT", "/api/database/config", {
      provider: "postgres",
      postgres: { host: "db.invalid" },
    });
    const { res, getStatus, getJson } = createMockResponse();

    const handled = await handleDatabaseRoute(
      req,
      res,
      null,
      "/api/database/config",
    );

    expect(handled).toBe(true);
    expect(getStatus()).toBe(400);
    expect(String((getJson() as { error?: string })?.error ?? "")).toContain(
      "failed DNS resolution during validation",
    );
    expect(saveMilaidyConfigMock).not.toHaveBeenCalled();
  });
});
