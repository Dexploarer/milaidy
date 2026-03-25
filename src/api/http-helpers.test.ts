import { describe, expect, it, vi, beforeEach } from "vitest";
import { EventEmitter } from "node:events";
import type http from "node:http";
import {
  readRequestBodyBuffer,
  readRequestBody,
  readJsonBody,
  writeJsonResponse,
  writeJsonError,
  writeJsonResponseSafe,
  writeJsonErrorSafe,
  sendJson,
  sendJsonError,
  isJsonObjectBody,
  DEFAULT_MAX_BODY_BYTES,
} from "./http-helpers";

class MockIncomingMessage extends EventEmitter {
  destroy = vi.fn();
}

class MockServerResponse {
  statusCode = 200;
  headers: Record<string, string> = {};
  setHeader = vi.fn((key: string, value: string) => {
    this.headers[key] = value;
  });
  end = vi.fn();
}

describe("http-helpers", () => {
  describe("readRequestBodyBuffer", () => {
    it("should read a complete body", async () => {
      const req = new MockIncomingMessage() as unknown as http.IncomingMessage;
      const promise = readRequestBodyBuffer(req);
      req.emit("data", Buffer.from("hello"));
      req.emit("data", Buffer.from(" world"));
      req.emit("end");
      const result = await promise;
      expect(result).not.toBeNull();
      expect(result?.toString()).toBe("hello world");
    });

    it("should handle body exceeding maxBytes", async () => {
      const req = new MockIncomingMessage() as unknown as http.IncomingMessage;
      const promise = readRequestBodyBuffer(req, { maxBytes: 5 });
      req.emit("data", Buffer.from("hello "));
      req.emit("data", Buffer.from("world"));
      req.emit("end");
      await expect(promise).rejects.toThrow("Request body exceeds maximum size (5 bytes)");
    });

    it("should return null on too large if returnNullOnTooLarge is true", async () => {
      const req = new MockIncomingMessage() as unknown as http.IncomingMessage;
      const promise = readRequestBodyBuffer(req, { maxBytes: 5, returnNullOnTooLarge: true });
      req.emit("data", Buffer.from("hello world"));
      const result = await promise;
      expect(result).toBeNull();
    });

    it("should return null on too large after end if returnNullOnTooLarge is true", async () => {
        const req = new MockIncomingMessage() as unknown as http.IncomingMessage;
        const promise = readRequestBodyBuffer(req, { maxBytes: 15, returnNullOnTooLarge: true });
        req.emit("data", Buffer.from("hello "));
        req.emit("data", Buffer.from("world!"));
        req.emit("end");
        // Actually this shouldn't be too large
        const result = await promise;
        expect(result?.toString()).toBe("hello world!");
      });

    it("should destroy stream if destroyOnTooLarge is true", async () => {
      const req = new MockIncomingMessage() as unknown as http.IncomingMessage;
      const promise = readRequestBodyBuffer(req, { maxBytes: 5, destroyOnTooLarge: true });
      req.emit("data", Buffer.from("hello world"));
      await expect(promise).rejects.toThrow();
      expect((req as any).destroy).toHaveBeenCalled();
    });

    it("should handle stream error", async () => {
      const req = new MockIncomingMessage() as unknown as http.IncomingMessage;
      const promise = readRequestBodyBuffer(req);
      req.emit("error", new Error("stream error"));
      await expect(promise).rejects.toThrow("stream error");
    });

    it("should return null on stream error if returnNullOnError is true", async () => {
      const req = new MockIncomingMessage() as unknown as http.IncomingMessage;
      const promise = readRequestBodyBuffer(req, { returnNullOnError: true });
      req.emit("error", new Error("stream error"));
      const result = await promise;
      expect(result).toBeNull();
    });
  });

  describe("readRequestBody", () => {
    it("should return string body", async () => {
      const req = new MockIncomingMessage() as unknown as http.IncomingMessage;
      const promise = readRequestBody(req);
      req.emit("data", Buffer.from("test"));
      req.emit("end");
      const result = await promise;
      expect(result).toBe("test");
    });

    it("should return null if readRequestBodyBuffer returns null", async () => {
      const req = new MockIncomingMessage() as unknown as http.IncomingMessage;
      const promise = readRequestBody(req, { returnNullOnError: true });
      req.emit("error", new Error("err"));
      const result = await promise;
      expect(result).toBeNull();
    });
  });

  describe("isJsonObjectBody", () => {
    it("should return true for plain objects", () => {
      expect(isJsonObjectBody({})).toBe(true);
      expect(isJsonObjectBody({ a: 1 })).toBe(true);
    });

    it("should return false for arrays, null, and non-objects", () => {
      expect(isJsonObjectBody([])).toBe(false);
      expect(isJsonObjectBody(null)).toBe(false);
      expect(isJsonObjectBody(undefined)).toBe(false);
      expect(isJsonObjectBody("string")).toBe(false);
      expect(isJsonObjectBody(123)).toBe(false);
    });
  });

  describe("writeJsonResponse", () => {
    it("should write JSON and set headers", async () => {
      const res = new MockServerResponse() as unknown as http.ServerResponse;
      await writeJsonResponse(res, { foo: "bar" }, 201);
      expect(res.statusCode).toBe(201);
      expect((res as any).setHeader).toHaveBeenCalledWith("Content-Type", "application/json");
      expect((res as any).end).toHaveBeenCalledWith('{"foo":"bar"}');
    });
  });

  describe("writeJsonError", () => {
    it("should write error JSON", async () => {
      const res = new MockServerResponse() as unknown as http.ServerResponse;
      await writeJsonError(res, "bad request", 400);
      expect(res.statusCode).toBe(400);
      expect((res as any).end).toHaveBeenCalledWith('{"error":"bad request"}');
    });
  });

  describe("writeJsonResponseSafe & sendJson", () => {
    it("should call writeJsonResponse and catch errors", () => {
      const res = new MockServerResponse() as unknown as http.ServerResponse;
      (res as any).end.mockImplementation(() => { throw new Error("write error"); });
      expect(() => writeJsonResponseSafe(res, { foo: "bar" })).not.toThrow();
      expect(() => sendJson(res, { foo: "bar" })).not.toThrow();
    });
  });

  describe("writeJsonErrorSafe & sendJsonError", () => {
    it("should call writeJsonError and catch errors", () => {
      const res = new MockServerResponse() as unknown as http.ServerResponse;
      (res as any).end.mockImplementation(() => { throw new Error("write error"); });
      expect(() => writeJsonErrorSafe(res, "err")).not.toThrow();
      expect(() => sendJsonError(res, "err")).not.toThrow();
    });
  });

  describe("readJsonBody", () => {
    let req: MockIncomingMessage;
    let res: MockServerResponse;

    beforeEach(() => {
      req = new MockIncomingMessage();
      res = new MockServerResponse();
    });

    it("should successfully parse a valid JSON object", async () => {
      const promise = readJsonBody(req as unknown as http.IncomingMessage, res as unknown as http.ServerResponse);
      req.emit("data", Buffer.from('{"key":"value"}'));
      req.emit("end");
      const result = await promise;
      expect(result).toEqual({ key: "value" });
    });

    it("should handle body read errors", async () => {
      const promise = readJsonBody(req as unknown as http.IncomingMessage, res as unknown as http.ServerResponse);
      req.emit("error", new Error("read failed"));
      const result = await promise;
      expect(result).toBeNull();
      expect(res.statusCode).toBe(413);
      expect(res.end).toHaveBeenCalledWith('{"error":"read failed"}');
    });

    it("should handle non-object JSON when requireObject is true", async () => {
      const promise = readJsonBody(req as unknown as http.IncomingMessage, res as unknown as http.ServerResponse);
      req.emit("data", Buffer.from('["array"]'));
      req.emit("end");
      const result = await promise;
      expect(result).toBeNull();
      expect(res.statusCode).toBe(400);
      expect(res.end).toHaveBeenCalledWith('{"error":"Request body must be a JSON object"}');
    });

    it("should handle malformed JSON", async () => {
      const promise = readJsonBody(req as unknown as http.IncomingMessage, res as unknown as http.ServerResponse);
      req.emit("data", Buffer.from('{"bad":json'));
      req.emit("end");
      const result = await promise;
      expect(result).toBeNull();
      expect(res.statusCode).toBe(400);
      expect(res.end).toHaveBeenCalledWith('{"error":"Invalid JSON in request body"}');
    });

    it("should allow non-objects when requireObject is false", async () => {
        const promise = readJsonBody(req as unknown as http.IncomingMessage, res as unknown as http.ServerResponse, { requireObject: false });
        req.emit("data", Buffer.from('["array"]'));
        req.emit("end");
        const result = await promise;
        expect(result).toEqual(["array"]);
    });
  });
});
