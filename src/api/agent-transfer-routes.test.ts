import type http from "node:http";
import type { AgentRuntime } from "@elizaos/core";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { createMockIncomingMessage } from "../test-support/test-helpers";
import {
  type AgentTransferRouteState,
  handleAgentTransferRoutes,
} from "./agent-transfer-routes";
import * as httpHelpers from "./http-helpers";

const mockedExports = vi.hoisted(() => {
  class TestAgentExportError extends Error {}
  return {
    AgentExportError: TestAgentExportError,
    exportAgent: vi.fn(async () => Buffer.from("exported")),
    estimateExportSize: vi.fn(async () => ({ bytes: 1234 })),
    importAgent: vi.fn(async () => ({ imported: true })),
  };
});

vi.mock("../services/agent-export", () => ({
  AgentExportError: mockedExports.AgentExportError,
  estimateExportSize: mockedExports.estimateExportSize,
  exportAgent: mockedExports.exportAgent,
  importAgent: mockedExports.importAgent,
}));

function createRuntimeStub(): AgentRuntime {
  return {
    character: { name: "Milady" },
  } as unknown as AgentRuntime;
}

function createMockResponse() {
  const headers: Record<string, string | number> = {};
  let body: Buffer | null = null;
  const res = {
    statusCode: 200,
    setHeader: (key: string, value: string | number) => {
      headers[key] = value;
    },
    end: (chunk?: string | Buffer) => {
      body =
        chunk === undefined
          ? null
          : Buffer.isBuffer(chunk)
            ? chunk
            : Buffer.from(chunk, "utf-8");
    },
  } as unknown as http.ServerResponse;

  return { res, headers, getBody: () => body };
}

type InvokeOptions = {
  method: string;
  pathname: string;
  state?: AgentTransferRouteState;
  jsonBody?: Record<string, unknown> | null;
  rawBody?: Buffer;
};

async function invokeRoute(options: InvokeOptions) {
  const state = options.state ?? { runtime: createRuntimeStub() };
  const req = createMockIncomingMessage({
    method: options.method,
    url: options.pathname,
    body: options.rawBody,
  });
  const { res, headers, getBody } = createMockResponse();
  let status = 200;
  let payload: Record<string, unknown> | null = null;

  const handled = await handleAgentTransferRoutes({
    req,
    res,
    method: options.method,
    pathname: options.pathname,
    state,
    readJsonBody: async () => options.jsonBody ?? null,
    json: (_res, data, code = 200) => {
      status = code;
      payload = data as Record<string, unknown>;
    },
    error: (_res, message, code = 400) => {
      status = code;
      payload = { error: message };
    },
  });

  return {
    handled,
    status,
    payload,
    headers,
    rawBody: getBody(),
  };
}

describe("agent transfer routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("returns false for non-transfer routes", async () => {
    const result = await invokeRoute({
      method: "GET",
      pathname: "/api/status",
    });

    expect(result.handled).toBe(false);
  });

  test("requires running runtime for export", async () => {
    const result = await invokeRoute({
      method: "POST",
      pathname: "/api/agent/export",
      state: { runtime: null },
      jsonBody: { password: "test" },
    });

    expect(result.status).toBe(503);
    expect(result.payload).toMatchObject({
      error: "Agent is not running — start it before exporting.",
    });
  });

  test("requires password for export", async () => {
    const result = await invokeRoute({
      method: "POST",
      pathname: "/api/agent/export",
      jsonBody: {},
    });

    expect(result.status).toBe(400);
    expect(result.payload).toMatchObject({
      error: "A password of at least 4 characters is required.",
    });
  });

  test("rejects password shorter than 4 characters for export", async () => {
    const result = await invokeRoute({
      method: "POST",
      pathname: "/api/agent/export",
      jsonBody: { password: "abc" },
    });

    expect(result.status).toBe(400);
    expect(result.payload).toMatchObject({
      error: "A password of at least 4 characters is required.",
    });
  });

  test("handles AgentExportError during export", async () => {
    mockedExports.exportAgent.mockRejectedValueOnce(
      new mockedExports.AgentExportError("Export error message"),
    );

    const result = await invokeRoute({
      method: "POST",
      pathname: "/api/agent/export",
      jsonBody: { password: "test" },
    });

    expect(result.status).toBe(400);
    expect(result.payload).toMatchObject({
      error: "Export error message",
    });
  });

  test("handles generic Error during export", async () => {
    mockedExports.exportAgent.mockRejectedValueOnce(
      new Error("Unexpected failure"),
    );

    const result = await invokeRoute({
      method: "POST",
      pathname: "/api/agent/export",
      jsonBody: { password: "test" },
    });

    expect(result.status).toBe(500);
    expect(result.payload).toMatchObject({
      error: "Export failed: Unexpected failure",
    });
  });

  test("writes binary export response", async () => {
    const result = await invokeRoute({
      method: "POST",
      pathname: "/api/agent/export",
      jsonBody: { password: "test", includeLogs: true },
    });

    expect(result.handled).toBe(true);
    expect(result.rawBody).toEqual(Buffer.from("exported"));
    expect(result.headers["Content-Type"]).toBe("application/octet-stream");
    expect(result.headers["Content-Length"]).toBe(8);
    expect(String(result.headers["Content-Disposition"])).toContain(
      ".eliza-agent",
    );
    expect(mockedExports.exportAgent).toHaveBeenCalledTimes(1);
  });

  test("returns export estimate", async () => {
    const result = await invokeRoute({
      method: "GET",
      pathname: "/api/agent/export/estimate",
    });

    expect(result.status).toBe(200);
    expect(result.payload).toMatchObject({ bytes: 1234 });
    expect(mockedExports.estimateExportSize).toHaveBeenCalledTimes(1);
  });

  test("requires running runtime for estimate", async () => {
    const result = await invokeRoute({
      method: "GET",
      pathname: "/api/agent/export/estimate",
      state: { runtime: null },
    });

    expect(result.status).toBe(503);
    expect(result.payload).toMatchObject({
      error: "Agent is not running.",
    });
  });

  test("handles Error during estimate", async () => {
    mockedExports.estimateExportSize.mockRejectedValueOnce(
      new Error("Estimate failure"),
    );

    const result = await invokeRoute({
      method: "GET",
      pathname: "/api/agent/export/estimate",
    });

    expect(result.status).toBe(500);
    expect(result.payload).toMatchObject({
      error: "Estimate failed: Estimate failure",
    });
  });

  test("requires running runtime for import", async () => {
    const result = await invokeRoute({
      method: "POST",
      pathname: "/api/agent/import",
      state: { runtime: null },
      rawBody: Buffer.from("abc"),
    });

    expect(result.status).toBe(503);
    expect(result.payload).toMatchObject({
      error: "Agent is not running — start it before importing.",
    });
  });

  test("rejects too-small import body", async () => {
    const result = await invokeRoute({
      method: "POST",
      pathname: "/api/agent/import",
      rawBody: Buffer.from([0, 0, 0, 0]),
    });

    expect(result.status).toBe(400);
    expect(result.payload).toMatchObject({
      error: "Request body is too small — expected password + file data.",
    });
  });

  test("handles read body error", async () => {
    vi.spyOn(httpHelpers, "readRequestBodyBuffer").mockRejectedValueOnce(
      new Error("Request body exceeds maximum size (536870912 bytes)")
    );

    const result = await invokeRoute({
      method: "POST",
      pathname: "/api/agent/import",
      rawBody: Buffer.from("data"),
    });

    expect(result.status).toBe(413);
    expect(result.payload).toMatchObject({
      error: "Request body exceeds maximum size (536870912 bytes)",
    });
  });

  test("rejects short password in binary envelope", async () => {
    const passwordBuffer = Buffer.from("abc", "utf-8"); // Length 3
    const envelope = Buffer.concat([
      Buffer.from([0, 0, 0, 3]), // 4 bytes for length
      passwordBuffer,
      Buffer.from("data"),
    ]);

    const result = await invokeRoute({
      method: "POST",
      pathname: "/api/agent/import",
      rawBody: envelope,
    });

    expect(result.status).toBe(400);
    expect(result.payload).toMatchObject({
      error: "Password must be at least 4 characters.",
    });
  });

  test("rejects extremely long password in binary envelope", async () => {
    const envelope = Buffer.concat([
      Buffer.from([0, 0, 5, 0]), // 4 bytes for length (1280 > 1024)
      Buffer.alloc(1280, "a"),
      Buffer.from("data"),
    ]);

    const result = await invokeRoute({
      method: "POST",
      pathname: "/api/agent/import",
      rawBody: envelope,
    });

    expect(result.status).toBe(400);
    expect(result.payload).toMatchObject({
      error: "Password is too long (max 1024 bytes).",
    });
  });

  test("rejects incomplete envelope (missing file data after password)", async () => {
    const passwordBuffer = Buffer.from("test", "utf-8"); // Length 4
    const envelope = Buffer.concat([
      Buffer.from([0, 0, 0, 4]),
      passwordBuffer,
      // No extra data
    ]);

    const result = await invokeRoute({
      method: "POST",
      pathname: "/api/agent/import",
      rawBody: envelope,
    });

    expect(result.status).toBe(400);
    expect(result.payload).toMatchObject({
      error: "Request body is incomplete — missing file data after password.",
    });
  });

  test("handles AgentExportError during import", async () => {
    mockedExports.importAgent.mockRejectedValueOnce(
      new mockedExports.AgentExportError("Import validation failed"),
    );

    const passwordBuffer = Buffer.from("test", "utf-8");
    const envelope = Buffer.concat([
      Buffer.from([0, 0, 0, 4]),
      passwordBuffer,
      Buffer.from("data"),
    ]);

    const result = await invokeRoute({
      method: "POST",
      pathname: "/api/agent/import",
      rawBody: envelope,
    });

    expect(result.status).toBe(400);
    expect(result.payload).toMatchObject({
      error: "Import validation failed",
    });
  });

  test("handles generic Error during import", async () => {
    mockedExports.importAgent.mockRejectedValueOnce(
      new Error("Unexpected import error"),
    );

    const passwordBuffer = Buffer.from("test", "utf-8");
    const envelope = Buffer.concat([
      Buffer.from([0, 0, 0, 4]),
      passwordBuffer,
      Buffer.from("data"),
    ]);

    const result = await invokeRoute({
      method: "POST",
      pathname: "/api/agent/import",
      rawBody: envelope,
    });

    expect(result.status).toBe(500);
    expect(result.payload).toMatchObject({
      error: "Import failed: Unexpected import error",
    });
  });

  test("imports from password + payload envelope", async () => {
    const password = "test";
    const payload = Buffer.from("agent-data");
    const passwordBuffer = Buffer.from(password, "utf-8");
    const envelope = Buffer.concat([
      Buffer.from([
        (passwordBuffer.length >>> 24) & 0xff,
        (passwordBuffer.length >>> 16) & 0xff,
        (passwordBuffer.length >>> 8) & 0xff,
        passwordBuffer.length & 0xff,
      ]),
      passwordBuffer,
      payload,
    ]);

    const result = await invokeRoute({
      method: "POST",
      pathname: "/api/agent/import",
      rawBody: envelope,
    });

    expect(result.status).toBe(200);
    expect(result.payload).toMatchObject({ imported: true });
    expect(mockedExports.importAgent).toHaveBeenCalledTimes(1);
    expect(mockedExports.importAgent).toHaveBeenCalledWith(
      expect.anything(),
      payload,
      "test",
    );
  });
});
