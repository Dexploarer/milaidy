import { describe, it, expect, vi } from "vitest";
import { EventEmitter } from "node:events";
import type http from "node:http";
import {
  readRequestBodyBuffer,
  readRequestBody,
  readJsonBody,
  writeJsonResponse,
  writeJsonError,
  writeJsonResponseSafe,
  sendJson,
  sendJsonError,
  writeJsonErrorSafe,
  isJsonObjectBody,
} from "./http-helpers";

// Helper to mock request
function createMockReq(dataChunks: string[] | Buffer[], simulateError?: boolean) {
  const req = new EventEmitter() as http.IncomingMessage;
  req.destroy = vi.fn();

  // Need to emit in the next tick to allow listeners to attach
  process.nextTick(() => {
    for (const chunk of dataChunks) {
      req.emit("data", Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    if (simulateError) {
      req.emit("error", new Error("Simulated stream error"));
    } else {
      req.emit("end");
    }
  });

  return req;
}

// Helper to mock response
function createMockRes() {
  let jsonOutput = "";
  const res = {
    statusCode: 200,
    setHeader: vi.fn(),
    end: vi.fn((data) => {
      if (data) jsonOutput = data.toString();
    }),
  } as unknown as http.ServerResponse;

  return { res, getJsonOutput: () => jsonOutput };
}

describe("http-helpers", () => {
  describe("readRequestBodyBuffer", () => {
    it("should successfully read data into a buffer", async () => {
      const req = createMockReq(["hello", " ", "world"]);
      const buf = await readRequestBodyBuffer(req);
      expect(buf?.toString()).toBe("hello world");
    });

    it("should reject if maxBytes is exceeded", async () => {
      const req = createMockReq(["123456"]); // 6 bytes
      await expect(readRequestBodyBuffer(req, { maxBytes: 5 })).rejects.toThrow(
        "Request body exceeds maximum size (5 bytes)"
      );
    });

    it("should return null if maxBytes exceeded and returnNullOnTooLarge is true", async () => {
      const req = createMockReq(["123456"]); // 6 bytes
      const result = await readRequestBodyBuffer(req, {
        maxBytes: 5,
        returnNullOnTooLarge: true,
      });
      expect(result).toBeNull();
    });

    it("should destroy the request if maxBytes exceeded and destroyOnTooLarge is true", async () => {
      const req = createMockReq(["123456"]); // 6 bytes
      await expect(
        readRequestBodyBuffer(req, { maxBytes: 5, destroyOnTooLarge: true })
      ).rejects.toThrow();
      expect(req.destroy).toHaveBeenCalled();
    });

    it("should destroy and return null if both flags are true", async () => {
      const req = createMockReq(["123456"]); // 6 bytes
      const result = await readRequestBodyBuffer(req, {
        maxBytes: 5,
        returnNullOnTooLarge: true,
        destroyOnTooLarge: true,
      });
      expect(result).toBeNull();
      expect(req.destroy).toHaveBeenCalled();
    });

    it("should use custom tooLargeMessage", async () => {
      const req = createMockReq(["123456"]); // 6 bytes
      await expect(
        readRequestBodyBuffer(req, { maxBytes: 5, tooLargeMessage: "Too big!" })
      ).rejects.toThrow("Too big!");
    });

    it("should reject on stream error by default", async () => {
      const req = createMockReq(["hello"], true);
      await expect(readRequestBodyBuffer(req)).rejects.toThrow(
        "Simulated stream error"
      );
    });

    it("should return null on stream error if returnNullOnError is true", async () => {
      const req = createMockReq(["hello"], true);
      const result = await readRequestBodyBuffer(req, { returnNullOnError: true });
      expect(result).toBeNull();
    });
  });

  describe("readRequestBody", () => {
    it("should return text string", async () => {
      const req = createMockReq(["hello", " ", "world"]);
      const text = await readRequestBody(req);
      expect(text).toBe("hello world");
    });

    it("should respect encoding", async () => {
      const hexStr = Buffer.from("hello world").toString("hex");
      const req = createMockReq([Buffer.from("hello world")]);
      const text = await readRequestBody(req, { encoding: "hex" });
      expect(text).toBe(hexStr);
    });

    it("should return null if stream errors with returnNullOnError", async () => {
      const req = createMockReq(["hello"], true);
      const text = await readRequestBody(req, { returnNullOnError: true });
      expect(text).toBeNull();
    });
  });

  describe("isJsonObjectBody", () => {
    it("should identify objects", () => {
      expect(isJsonObjectBody({})).toBe(true);
      expect(isJsonObjectBody({ a: 1 })).toBe(true);
    });

    it("should reject null, arrays, and primitives", () => {
      expect(isJsonObjectBody(null)).toBe(false);
      expect(isJsonObjectBody([])).toBe(false);
      expect(isJsonObjectBody(123)).toBe(false);
      expect(isJsonObjectBody("string")).toBe(false);
      expect(isJsonObjectBody(undefined)).toBe(false);
    });
  });

  describe("writeJsonResponse and friends", () => {
    it("writeJsonResponse should set headers and status", async () => {
      const { res, getJsonOutput } = createMockRes();
      await writeJsonResponse(res, { success: true }, 201);

      expect(res.statusCode).toBe(201);
      expect(res.setHeader).toHaveBeenCalledWith("Content-Type", "application/json");
      expect(getJsonOutput()).toBe(JSON.stringify({ success: true }));
    });

    it("writeJsonError should format error message", async () => {
      const { res, getJsonOutput } = createMockRes();
      await writeJsonError(res, "Bad Request", 400);

      expect(res.statusCode).toBe(400);
      expect(getJsonOutput()).toBe(JSON.stringify({ error: "Bad Request" }));
    });

    it("writeJsonResponseSafe should not throw on response write errors", async () => {
      const { res } = createMockRes();
      res.end = vi.fn(() => { throw new Error("Connection closed"); });

      expect(() => writeJsonResponseSafe(res, { a: 1 })).not.toThrow();
    });

    it("sendJson should be shorthand for writeJsonResponseSafe", () => {
      const { res, getJsonOutput } = createMockRes();
      sendJson(res, { result: "ok" });
      expect(getJsonOutput()).toBe(JSON.stringify({ result: "ok" }));
    });

    it("sendJsonError should be shorthand for writeJsonErrorSafe", () => {
      const { res, getJsonOutput } = createMockRes();
      sendJsonError(res, "Oops");
      expect(getJsonOutput()).toBe(JSON.stringify({ error: "Oops" }));
    });
  });

  describe("readJsonBody", () => {
    it("should parse valid JSON object", async () => {
      const req = createMockReq(['{"a": 1}']);
      const { res } = createMockRes();

      const parsed = await readJsonBody(req, res);
      expect(parsed).toEqual({ a: 1 });
    });

    it("should reject non-object JSON if requireObject is true", async () => {
      const req = createMockReq(['[1, 2, 3]']);
      const { res, getJsonOutput } = createMockRes();

      const parsed = await readJsonBody(req, res);
      expect(parsed).toBeNull();
      expect(res.statusCode).toBe(400);
      expect(getJsonOutput()).toBe(JSON.stringify({ error: "Request body must be a JSON object" }));
    });

    it("should accept non-object JSON if requireObject is false", async () => {
      const req = createMockReq(['[1, 2, 3]']);
      const { res } = createMockRes();

      const parsed = await readJsonBody<number[]>(req, res, { requireObject: false });
      expect(parsed).toEqual([1, 2, 3]);
    });

    it("should handle malformed JSON syntax", async () => {
      const req = createMockReq(['{"a": 1']);
      const { res, getJsonOutput } = createMockRes();

      const parsed = await readJsonBody(req, res);
      expect(parsed).toBeNull();
      expect(res.statusCode).toBe(400);
      expect(getJsonOutput()).toBe(JSON.stringify({ error: "Invalid JSON in request body" }));
    });

    it("should handle read errors properly", async () => {
      const req = createMockReq(['{"a": 1}'], true); // stream error
      const { res, getJsonOutput } = createMockRes();

      const parsed = await readJsonBody(req, res);
      expect(parsed).toBeNull();
      expect(res.statusCode).toBe(413); // Default readErrorStatus
      expect(getJsonOutput()).toBe(JSON.stringify({ error: "Simulated stream error" }));
    });

    it("should use default readErrorMessage if readRequestBody returns null without throwing", async () => {
      const req = createMockReq(['{"a": 1}'], true);
      const { res, getJsonOutput } = createMockRes();

      // returnNullOnError prevents the throw and returns null from readRequestBody
      const parsed = await readJsonBody(req, res, { returnNullOnError: true });
      expect(parsed).toBeNull();
      expect(res.statusCode).toBe(413);
      expect(getJsonOutput()).toBe(JSON.stringify({ error: "Failed to read request body" }));
    });
  });
});
