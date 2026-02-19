
import { describe, it, expect, vi } from "vitest";
import { EventEmitter } from "node:events";
import { readJsonBody } from "./http-helpers";

describe("CSRF Protection (Content-Type enforcement)", () => {
  it("should REJECT JSON with text/plain (CSRF Protection)", async () => {
    // Mock IncomingMessage
    const req: any = new EventEmitter();
    req.headers = { "content-type": "text/plain" };
    req.off = vi.fn();
    req.destroy = vi.fn();

    // Mock ServerResponse
    const res: any = {
      statusCode: 200,
      setHeader: vi.fn(),
      end: vi.fn(),
      writableEnded: false,
    };

    // Simulate body stream (though it shouldn't be read if header check fails first,
    // but our implementation checks header first)
    // We don't strictly need to emit data if it fails early, but good for robustness.
    setTimeout(() => {
        req.emit("data", Buffer.from(JSON.stringify({ command: "whoami" })));
        req.emit("end");
    }, 10);

    const body = await readJsonBody(req, res);

    expect(body).toBeNull();
    expect(res.statusCode).toBe(415);
    expect(res.end).toHaveBeenCalledWith(expect.stringContaining("Unsupported Media Type"));
  });

  it("should ACCEPT JSON with application/json", async () => {
    const req: any = new EventEmitter();
    req.headers = { "content-type": "application/json" };
    req.off = vi.fn();
    req.destroy = vi.fn();

    const res: any = {
      statusCode: 200,
      setHeader: vi.fn(),
      end: vi.fn(),
      writableEnded: false,
    };

    setTimeout(() => {
      req.emit("data", Buffer.from(JSON.stringify({ ok: true })));
      req.emit("end");
    }, 10);

    const body = await readJsonBody(req, res);
    expect(body).toEqual({ ok: true });
  });

  it("should ACCEPT JSON with application/json; charset=utf-8", async () => {
    const req: any = new EventEmitter();
    req.headers = { "content-type": "application/json; charset=utf-8" };
    req.off = vi.fn();
    req.destroy = vi.fn();

    const res: any = {
      statusCode: 200,
      setHeader: vi.fn(),
      end: vi.fn(),
      writableEnded: false,
    };

    setTimeout(() => {
      req.emit("data", Buffer.from(JSON.stringify({ ok: true })));
      req.emit("end");
    }, 10);

    const body = await readJsonBody(req, res);
    expect(body).toEqual({ ok: true });
  });
});
