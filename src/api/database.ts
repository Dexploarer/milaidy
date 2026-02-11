/**
 * Database management API handlers for the Milaidy Control UI.
 *
 * Provides endpoints for:
 * - Database provider configuration (PGLite vs Postgres)
 * - Connection testing for remote Postgres
 * - Table browsing and introspection
 * - Row-level CRUD operations
 * - Raw SQL query execution
 * - Database status and health
 *
 * All data endpoints use the active runtime's database adapter (Drizzle ORM)
 * so they work identically for both PGLite and Postgres.
 */

import type http from "node:http";
import type { AgentRuntime } from "@elizaos/core";
import type {
  DatabaseConfig,
  PostgresCredentials,
} from "../config/types.milaidy.js";
import {
  type ConnectionTestResult,
  deleteRow,
  executeSafeQuery,
  getDatabaseConfig,
  getDatabaseStatus,
  getRows,
  getTables,
  insertRow,
  saveDatabaseConfig,
  testDatabaseConnection,
  updateRow,
} from "../services/database.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function jsonResponse(
  res: http.ServerResponse,
  data: unknown,
  status = 200,
): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(data));
}

function errorResponse(
  res: http.ServerResponse,
  message: string,
  status = 400,
): void {
  jsonResponse(res, { error: message }, status);
}

function decodePathComponent(
  raw: string,
  res: http.ServerResponse,
  fieldName: string,
): string | null {
  try {
    return decodeURIComponent(raw);
  } catch {
    errorResponse(res, `Invalid ${fieldName}: malformed URL encoding`, 400);
    return null;
  }
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    req.on("data", (c: Buffer) => {
      totalBytes += c.length;
      if (totalBytes > 2 * 1024 * 1024) {
        reject(new Error("Request body too large"));
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString()));
    req.on("error", reject);
  });
}

/**
 * Read and parse a JSON request body with size limits and error handling.
 * Returns null (and sends a 4xx response) if reading or parsing fails.
 */
async function readJsonBody<T = Record<string, unknown>>(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<T | null> {
  let raw: string;
  try {
    raw = await readBody(req);
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : "Failed to read request body";
    errorResponse(res, msg, 413);
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed)) {
      errorResponse(res, "Request body must be a JSON object", 400);
      return null;
    }
    return parsed as T;
  } catch {
    errorResponse(res, "Invalid JSON in request body", 400);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

/**
 * GET /api/database/status
 * Returns current connection status, provider, table count, version.
 */
async function handleGetStatus(
  _req: http.IncomingMessage,
  res: http.ServerResponse,
  runtime: AgentRuntime | null,
): Promise<void> {
  const status = await getDatabaseStatus(runtime);
  jsonResponse(res, status);
}

/**
 * GET /api/database/config
 * Returns the persisted database configuration from milaidy.json.
 */
function handleGetConfig(
  _req: http.IncomingMessage,
  res: http.ServerResponse,
): void {
  const result = getDatabaseConfig();
  jsonResponse(res, result);
}

/**
 * PUT /api/database/config
 * Saves new database configuration. Does NOT restart the agent automatically;
 * the UI prompts the user to restart.
 */
async function handlePutConfig(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  const body = await readJsonBody<DatabaseConfig>(req, res);
  if (!body) return;

  try {
    const result = await saveDatabaseConfig(body);
    jsonResponse(res, result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    errorResponse(res, message);
  }
}

/**
 * POST /api/database/test
 * Tests a Postgres connection without persisting anything.
 * Body: { connectionString?, host?, port?, user?, password?, database?, ssl? }
 */
async function handleTestConnection(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  const body = await readJsonBody<PostgresCredentials>(req, res);
  if (!body) return;

  const result = await testDatabaseConnection(body);
  jsonResponse(res, result);
}

/**
 * GET /api/database/tables
 * Lists all user tables with column metadata and approximate row counts.
 */
async function handleGetTables(
  _req: http.IncomingMessage,
  res: http.ServerResponse,
  runtime: AgentRuntime,
): Promise<void> {
  try {
    const tables = await getTables(runtime);
    jsonResponse(res, { tables });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    errorResponse(res, message, 500);
  }
}

/**
 * GET /api/database/tables/:table/rows?offset=0&limit=50&sort=col&order=asc&search=term
 * Paginated row retrieval for a specific table.
 */
async function handleGetRows(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  runtime: AgentRuntime,
  tableName: string,
): Promise<void> {
  const url = new URL(
    req.url ?? "/",
    `http://${req.headers.host ?? "localhost"}`,
  );
  const offset = Math.max(0, Number(url.searchParams.get("offset") ?? "0"));
  const limit = Math.min(
    500,
    Math.max(1, Number(url.searchParams.get("limit") ?? "50")),
  );
  const sortCol = url.searchParams.get("sort") ?? "";
  const sortOrder = url.searchParams.get("order") === "desc" ? "DESC" : "ASC";
  const search = url.searchParams.get("search") ?? "";

  try {
    const result = await getRows(runtime, tableName, {
      offset,
      limit,
      sortCol,
      sortOrder,
      search,
    });
    jsonResponse(res, result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("not found")) {
      errorResponse(res, message, 404);
    } else {
      errorResponse(res, message, 500);
    }
  }
}

/**
 * POST /api/database/tables/:table/rows
 * Insert a new row. Body: { data: Record<string, unknown> }
 */
async function handleInsertRow(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  runtime: AgentRuntime,
  tableName: string,
): Promise<void> {
  const body = await readJsonBody<{
    data: Record<string, unknown>;
  }>(req, res);
  if (!body) return;

  try {
    const result = await insertRow(runtime, tableName, body.data);
    jsonResponse(res, result, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("not found")) {
      errorResponse(res, message, 404);
    } else {
      errorResponse(res, message, 400);
    }
  }
}

/**
 * PUT /api/database/tables/:table/rows
 * Update a row. Body: { where: Record<string, unknown>, data: Record<string, unknown> }
 */
async function handleUpdateRow(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  runtime: AgentRuntime,
  tableName: string,
): Promise<void> {
  const body = await readJsonBody<{
    where: Record<string, unknown>;
    data: Record<string, unknown>;
  }>(req, res);
  if (!body) return;

  try {
    const result = await updateRow(runtime, tableName, body.where, body.data);
    jsonResponse(res, result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("No matching row found")) {
      errorResponse(res, message, 404);
    } else {
      errorResponse(res, message, 400);
    }
  }
}

/**
 * DELETE /api/database/tables/:table/rows
 * Delete a row. Body: { where: Record<string, unknown> }
 */
async function handleDeleteRow(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  runtime: AgentRuntime,
  tableName: string,
): Promise<void> {
  const body = await readJsonBody<{
    where: Record<string, unknown>;
  }>(req, res);
  if (!body) return;

  try {
    const result = await deleteRow(runtime, tableName, body.where);
    jsonResponse(res, result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("No matching row found")) {
      errorResponse(res, message, 404);
    } else {
      errorResponse(res, message, 400);
    }
  }
}

/**
 * POST /api/database/query
 * Execute a raw SQL query. Body: { sql: string, readOnly?: boolean }
 */
async function handleQuery(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  runtime: AgentRuntime,
): Promise<void> {
  const body = await readJsonBody<{
    sql: string;
    readOnly?: boolean;
  }>(req, res);
  if (!body) return;

  if (
    !body.sql ||
    typeof body.sql !== "string" ||
    body.sql.trim().length === 0
  ) {
    errorResponse(res, "Request body must include a non-empty 'sql' string.");
    return;
  }

  try {
    const result = await executeSafeQuery(
      runtime,
      body.sql,
      body.readOnly !== false,
    );
    jsonResponse(res, result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    errorResponse(res, message, 400);
  }
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

/**
 * Route a database API request. Returns true if handled, false if not matched.
 *
 * Expected URL patterns:
 *   GET    /api/database/status
 *   GET    /api/database/config
 *   PUT    /api/database/config
 *   POST   /api/database/test
 *   GET    /api/database/tables
 *   GET    /api/database/tables/:table/rows
 *   POST   /api/database/tables/:table/rows
 *   PUT    /api/database/tables/:table/rows
 *   DELETE /api/database/tables/:table/rows
 *   POST   /api/database/query
 */
export async function handleDatabaseRoute(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  runtime: AgentRuntime | null,
  pathname: string,
): Promise<boolean> {
  const method = req.method ?? "GET";

  // ── GET /api/database/status ──────────────────────────────────────────
  if (method === "GET" && pathname === "/api/database/status") {
    await handleGetStatus(req, res, runtime);
    return true;
  }

  // ── GET /api/database/config ──────────────────────────────────────────
  if (method === "GET" && pathname === "/api/database/config") {
    handleGetConfig(req, res);
    return true;
  }

  // ── PUT /api/database/config ──────────────────────────────────────────
  if (method === "PUT" && pathname === "/api/database/config") {
    await handlePutConfig(req, res);
    return true;
  }

  // ── POST /api/database/test ───────────────────────────────────────────
  if (method === "POST" && pathname === "/api/database/test") {
    await handleTestConnection(req, res);
    return true;
  }

  // Routes below require a live runtime with a database adapter
  if (!runtime?.adapter) {
    errorResponse(
      res,
      "Database not available. The agent may not be running or the database adapter is not initialized.",
      503,
    );
    return true;
  }

  // ── GET /api/database/tables ──────────────────────────────────────────
  if (method === "GET" && pathname === "/api/database/tables") {
    await handleGetTables(req, res, runtime);
    return true;
  }

  // ── POST /api/database/query ──────────────────────────────────────────
  if (method === "POST" && pathname === "/api/database/query") {
    await handleQuery(req, res, runtime);
    return true;
  }

  // ── Table row operations: /api/database/tables/:table/rows ────────────
  const rowsMatch = pathname.match(/^\/api\/database\/tables\/([^/]+)\/rows$/);
  if (rowsMatch) {
    const tableNameDecoded = decodePathComponent(
      rowsMatch[1],
      res,
      "table name",
    );
    if (tableNameDecoded === null) return true;

    if (method === "GET") {
      await handleGetRows(req, res, runtime, tableNameDecoded);
      return true;
    }
    if (method === "POST") {
      await handleInsertRow(req, res, runtime, tableNameDecoded);
      return true;
    }
    if (method === "PUT") {
      await handleUpdateRow(req, res, runtime, tableNameDecoded);
      return true;
    }
    if (method === "DELETE") {
      await handleDeleteRow(req, res, runtime, tableNameDecoded);
      return true;
    }
  }

  return false;
}
