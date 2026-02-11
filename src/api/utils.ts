import type http from "node:http";

/**
 * Common API helper functions for request parsing and response formatting.
 */

/** Maximum request body size (1 MB) — prevents memory-based DoS. */
export const MAX_BODY_BYTES = 1_048_576;
export const MAX_IMPORT_BYTES = 512 * 1_048_576; // 512 MB for agent imports

export function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    req.on("data", (c: Buffer) => {
      totalBytes += c.length;
      if (totalBytes > MAX_BODY_BYTES) {
        req.destroy();
        reject(
          new Error(
            `Request body exceeds maximum size (${MAX_BODY_BYTES} bytes)`,
          ),
        );
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}

/**
 * Read raw binary request body with a configurable size limit.
 * Used for agent import file uploads.
 */
export function readRawBody(
  req: http.IncomingMessage,
  maxBytes: number,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    req.on("data", (c: Buffer) => {
      totalBytes += c.length;
      if (totalBytes > maxBytes) {
        req.destroy();
        reject(
          new Error(`Request body exceeds maximum size (${maxBytes} bytes)`),
        );
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

/**
 * Read and parse a JSON request body with size limits and error handling.
 * Returns null (and sends a 4xx response) if reading or parsing fails.
 */
export async function readJsonBody<T = Record<string, unknown>>(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<T | null> {
  let raw: string;
  try {
    raw = await readBody(req);
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : "Failed to read request body";
    error(res, msg, 413);
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed)) {
      error(res, "Request body must be a JSON object", 400);
      return null;
    }
    return parsed as T;
  } catch {
    error(res, "Invalid JSON in request body", 400);
    return null;
  }
}

export function json(
  res: http.ServerResponse,
  data: unknown,
  status = 200,
): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(data));
}

export function error(
  res: http.ServerResponse,
  message: string,
  status = 400,
): void {
  json(res, { error: message }, status);
}

export function decodePathComponent(
  raw: string,
  res: http.ServerResponse,
  fieldName: string,
): string | null {
  try {
    return decodeURIComponent(raw);
  } catch {
    error(res, `Invalid ${fieldName}: malformed URL encoding`, 400);
    return null;
  }
}
