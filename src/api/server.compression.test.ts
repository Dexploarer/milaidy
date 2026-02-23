import type http from "node:http";
import zlib from "node:zlib";
import { describe, expect, it, type Mock, vi } from "vitest";
import { json } from "./server.js";

// Need to mock dependencies of server.ts because importing it executes top-level code/imports
vi.mock("@elizaos/core", () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  stringToUuid: vi.fn(),
  createMessageMemory: vi.fn(),
  ChannelType: {},
}));

vi.mock("fs", () => ({
  default: {
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
  },
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
}));

vi.mock("../config/config.js", () => ({
  loadMilaidyConfig: vi.fn(),
  saveMilaidyConfig: vi.fn(),
  configFileExists: vi.fn(),
}));

vi.mock("../services/app-manager.js", () => ({
  AppManager: class {},
}));

describe("server compression", () => {
  it("compresses large responses when requested", () => {
    const res = {
      statusCode: 200,
      setHeader: vi.fn(),
      end: vi.fn(),
    } as unknown as http.ServerResponse;

    const req = {
      headers: {
        "accept-encoding": "gzip, deflate",
      },
    } as unknown as http.IncomingMessage;

    // Create a large object > 1024 bytes
    const data = { large: "a".repeat(2000) };

    json(res, data, 200, req);

    expect(res.setHeader).toHaveBeenCalledWith("Content-Encoding", "gzip");
    expect(res.end).toHaveBeenCalled();
    const callArgs = (res.end as Mock).mock.calls[0][0];
    expect(Buffer.isBuffer(callArgs)).toBe(true);

    // Verify content is valid gzip
    const decoded = zlib.gunzipSync(callArgs);
    expect(JSON.parse(decoded.toString())).toEqual(data);
  });

  it("does not compress small responses", () => {
    const res = {
      statusCode: 200,
      setHeader: vi.fn(),
      end: vi.fn(),
    } as unknown as http.ServerResponse;

    const req = {
      headers: {
        "accept-encoding": "gzip",
      },
    } as unknown as http.IncomingMessage;

    const data = { small: "a" };

    json(res, data, 200, req);

    expect(res.setHeader).not.toHaveBeenCalledWith("Content-Encoding", "gzip");
    expect(res.end).toHaveBeenCalledWith(JSON.stringify(data));
  });

  it("does not compress if gzip not accepted", () => {
    const res = {
      statusCode: 200,
      setHeader: vi.fn(),
      end: vi.fn(),
    } as unknown as http.ServerResponse;

    const req = {
      headers: {
        "accept-encoding": "deflate",
      },
    } as unknown as http.IncomingMessage;

    const data = { large: "a".repeat(2000) };

    json(res, data, 200, req);

    expect(res.setHeader).not.toHaveBeenCalledWith("Content-Encoding", "gzip");
    expect(res.end).toHaveBeenCalledWith(JSON.stringify(data));
  });

  it("does not compress if req is missing", () => {
    const res = {
      statusCode: 200,
      setHeader: vi.fn(),
      end: vi.fn(),
    } as unknown as http.ServerResponse;

    const data = { large: "a".repeat(2000) };

    json(res, data, 200);

    expect(res.setHeader).not.toHaveBeenCalledWith("Content-Encoding", "gzip");
    expect(res.end).toHaveBeenCalledWith(JSON.stringify(data));
  });
});
