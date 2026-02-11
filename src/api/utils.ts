import http from "node:http";

/** Maximum request body size (1 MB) — prevents memory-based DoS. */
const MAX_BODY_BYTES = 1_048_576;
const MAX_IMPORT_BYTES = 512 * 1_048_576; // 512 MB for agent imports

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
  maxBytes: number = MAX_IMPORT_BYTES,
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

// ---------------------------------------------------------------------------
// Config redaction
// ---------------------------------------------------------------------------

/**
 * Key patterns that indicate a value is sensitive and must be redacted.
 * Matches against the property key at any nesting depth.  Aligned with
 * SENSITIVE_PATTERNS in src/config/schema.ts so every field the UI marks
 * as sensitive is also redacted in the API response.
 *
 * RESIDUAL RISK: Key-based redaction is heuristic — secrets stored under
 * generic keys (e.g. "value", "data", "config") will not be caught.  A
 * stronger approach would be either (a) schema-level `sensitive: true`
 * annotations that drive redaction, or (b) an allowlist that only exposes
 * known-safe fields and strips everything else.  Both require deeper
 * changes to the config schema infrastructure.
 */
const SENSITIVE_KEY_RE =
  /password|secret|api.?key|private.?key|seed.?phrase|authorization|connection.?string|credential|(?<!max)tokens?$/i;

/**
 * Replace any non-empty value with "[REDACTED]".  For arrays, each string
 * element is individually redacted; for objects, all string leaves are
 * redacted.  Non-string primitives (booleans, numbers) are replaced with
 * the string "[REDACTED]" to avoid leaking e.g. numeric PINs.
 */
export function redactValue(val: unknown): unknown {
  if (val === null || val === undefined) return val;
  if (typeof val === "string") return val.length > 0 ? "[REDACTED]" : "";
  if (typeof val === "number" || typeof val === "boolean") return "[REDACTED]";
  if (Array.isArray(val)) return val.map(redactValue);
  if (typeof val === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      out[k] = redactValue(v);
    }
    return out;
  }
  return "[REDACTED]";
}

/**
 * Recursively walk a JSON-safe value.  For every object property whose key
 * matches SENSITIVE_KEY_RE, redact the **entire value** regardless of type
 * (string, array, nested object).  This prevents leaks when secrets are
 * stored as arrays (e.g. `apiKeys: ["sk-1","sk-2"]`) or objects.
 * Returns a deep copy — the original is never mutated.
 */
export function redactDeep(val: unknown): unknown {
  if (val === null || val === undefined) return val;
  if (Array.isArray(val)) return val.map(redactDeep);
  if (typeof val === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(val as Record<string, unknown>)) {
      if (SENSITIVE_KEY_RE.test(key)) {
        out[key] = redactValue(child);
      } else {
        out[key] = redactDeep(child);
      }
    }
    return out;
  }
  return val;
}

/**
 * Return a deep copy of the config with every sensitive value replaced by
 * "[REDACTED]".  Uses a recursive walk so that ANY future config field
 * whose key matches the sensitive pattern is automatically covered —
 * no manual enumeration required.
 */
export function redactConfigSecrets(
  config: Record<string, unknown>,
): Record<string, unknown> {
  return redactDeep(config) as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Skill-ID path-traversal guard
// ---------------------------------------------------------------------------

/**
 * Validate that a user-supplied skill ID is safe to use in filesystem paths.
 * Rejects IDs containing path separators, ".." sequences, or any characters
 * outside the safe set used by the marketplace (`safeName()` in
 * skill-marketplace.ts).  Returns `null` and sends a 400 response if the
 * ID is invalid.
 */
const SAFE_SKILL_ID_RE = /^[a-zA-Z0-9._-]+$/;

export function validateSkillId(
  skillId: string,
  res: http.ServerResponse,
): string | null {
  if (
    !skillId ||
    !SAFE_SKILL_ID_RE.test(skillId) ||
    skillId === "." ||
    skillId.includes("..")
  ) {
    const safeDisplay = skillId.slice(0, 80).replace(/[^\x20-\x7e]/g, "?");
    error(res, `Invalid skill ID: "${safeDisplay}"`, 400);
    return null;
  }
  return skillId;
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

export function maskValue(value: string): string {
  if (value.length <= 8) return "****";
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

// ---------------------------------------------------------------------------
// Auth & CORS helpers
// ---------------------------------------------------------------------------

import crypto from "node:crypto";

const LOCAL_ORIGIN_RE = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i;
const APP_ORIGIN_RE =
  /^(capacitor|capacitor-electron|app):\/\/(localhost|-)?$/i;

export function resolveCorsOrigin(origin?: string): string | null {
  if (!origin) return null;
  const trimmed = origin.trim();
  if (!trimmed) return null;

  // Explicit allowlist via env (comma-separated)
  const extra = process.env.MILAIDY_ALLOWED_ORIGINS;
  if (extra) {
    const allow = extra
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
    if (allow.includes(trimmed)) return trimmed;
  }

  if (LOCAL_ORIGIN_RE.test(trimmed)) return trimmed;
  if (APP_ORIGIN_RE.test(trimmed)) return trimmed;
  if (trimmed === "null" && process.env.MILAIDY_ALLOW_NULL_ORIGIN === "1")
    return "null";
  return null;
}

export function applyCors(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): boolean {
  const origin =
    typeof req.headers.origin === "string" ? req.headers.origin : undefined;
  const allowed = resolveCorsOrigin(origin);

  if (origin && !allowed) return false;

  if (allowed) {
    res.setHeader("Access-Control-Allow-Origin", allowed);
    res.setHeader("Vary", "Origin");
    res.setHeader(
      "Access-Control-Allow-Methods",
      "GET, POST, PUT, DELETE, OPTIONS",
    );
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, X-Milaidy-Token, X-Api-Key",
    );
  }

  return true;
}

export function extractAuthToken(req: http.IncomingMessage): string | null {
  const auth =
    typeof req.headers.authorization === "string"
      ? req.headers.authorization.trim()
      : "";
  if (auth) {
    const match = /^Bearer\s+(.+)$/i.exec(auth);
    if (match?.[1]) return match[1].trim();
  }

  const header =
    (typeof req.headers["x-milaidy-token"] === "string" &&
      req.headers["x-milaidy-token"]) ||
    (typeof req.headers["x-api-key"] === "string" && req.headers["x-api-key"]);
  if (typeof header === "string" && header.trim()) return header.trim();

  return null;
}

export function isAuthorized(req: http.IncomingMessage): boolean {
  const expected = process.env.MILAIDY_API_TOKEN?.trim();
  if (!expected) return true;
  const provided = extractAuthToken(req);
  if (!provided) return false;
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(provided, "utf8");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
