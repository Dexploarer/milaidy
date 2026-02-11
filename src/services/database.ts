/**
 * Database service for Milaidy.
 * Encapsulates database operations, connection management, and configuration.
 */

import dns from "node:dns";
import { promisify } from "node:util";
import { type AgentRuntime, logger } from "@elizaos/core";
import { loadMilaidyConfig, saveMilaidyConfig } from "../config/config.js";
import type {
  DatabaseConfig,
  DatabaseProviderType,
  PostgresCredentials,
} from "../config/types.milaidy.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DatabaseStatus {
  provider: DatabaseProviderType;
  connected: boolean;
  serverVersion: string | null;
  tableCount: number;
  pgliteDataDir: string | null;
  postgresHost: string | null;
}

export interface TableInfo {
  name: string;
  schema: string;
  rowCount: number;
  columns: ColumnInfo[];
}

export interface ColumnInfo {
  name: string;
  type: string;
  nullable: boolean;
  defaultValue: string | null;
  isPrimaryKey: boolean;
}

export interface QueryResult {
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  durationMs: number;
}

export interface ConnectionTestResult {
  success: boolean;
  serverVersion: string | null;
  error: string | null;
  durationMs: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Safely quote a SQL identifier (table or column name).
 * Postgres uses double-quote escaping: embedded " becomes "".
 */
export function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

/**
 * Build a Postgres connection string from individual credential fields.
 */
export function buildConnectionString(creds: PostgresCredentials): string {
  if (creds.connectionString) return creds.connectionString;
  const host = creds.host ?? "localhost";
  const port = creds.port ?? 5432;
  const user = encodeURIComponent(creds.user ?? "postgres");
  const password = creds.password ? encodeURIComponent(creds.password) : "";
  const database = creds.database ?? "postgres";
  const auth = password ? `${user}:${password}` : user;
  const sslParam = creds.ssl ? "?sslmode=require" : "";
  return `postgresql://${auth}@${host}:${port}/${database}${sslParam}`;
}

// ---------------------------------------------------------------------------
// Host validation — prevent SSRF via database connection endpoints
// ---------------------------------------------------------------------------

const dnsLookupAll = promisify(dns.lookup);

/**
 * IP ranges that are ALWAYS blocked regardless of bind address.
 * Cloud metadata and "this" network are never legitimate Postgres targets.
 */
const ALWAYS_BLOCKED_IP_PATTERNS: RegExp[] = [
  /^169\.254\./, // Link-local / cloud metadata (AWS, GCP, Azure)
  /^0\./, // "This" network
  /^fe80:/i, // IPv6 link-local
];

/**
 * Private/internal IP ranges — blocked only when the API is bound to a
 * non-loopback address (i.e. remotely reachable).  When bound to 127.0.0.1
 * (the default), these are allowed since local Postgres is the most common
 * setup and an attacker who can reach the loopback API already has local
 * network access.
 */
const PRIVATE_IP_PATTERNS: RegExp[] = [
  /^127\./, // IPv4 loopback
  /^10\./, // RFC 1918 Class A
  /^172\.(1[6-9]|2\d|3[01])\./, // RFC 1918 Class B
  /^192\.168\./, // RFC 1918 Class C
  /^::1$/, // IPv6 loopback
  /^fc00:/i, // IPv6 ULA
];

/**
 * Returns true when the API server is bound to a loopback-only address.
 * In that case, private/internal IP ranges are allowed for DB connections
 * since only local processes can reach the API.
 */
function isApiLoopbackOnly(): boolean {
  const bind =
    (process.env.MILAIDY_API_BIND ?? "127.0.0.1").trim() || "127.0.0.1";
  return (
    bind === "127.0.0.1" || bind === "::1" || bind.toLowerCase() === "localhost"
  );
}

/**
 * Extract the host from a Postgres connection string or credentials object.
 * Returns `null` if no host can be determined.
 */
export function extractHost(creds: PostgresCredentials): string | null {
  if (creds.connectionString) {
    try {
      const url = new URL(creds.connectionString);
      return url.hostname || null;
    } catch {
      return null; // Unparseable — will be rejected
    }
  }
  return creds.host ?? null;
}

/**
 * Check whether an IP address falls in a blocked range.
 * When the API is remotely reachable, private ranges are also blocked.
 */
export function isBlockedIp(ip: string): boolean {
  if (ALWAYS_BLOCKED_IP_PATTERNS.some((p) => p.test(ip))) return true;
  if (!isApiLoopbackOnly() && PRIVATE_IP_PATTERNS.some((p) => p.test(ip)))
    return true;
  return false;
}

/**
 * Validate that the target host does not resolve to a blocked address.
 *
 * Performs DNS resolution to catch hostnames like `metadata.google.internal`
 * or `169.254.169.254.nip.io` that resolve to link-local / cloud metadata
 * IPs.  Also handles IPv6-mapped IPv4 addresses (e.g. `::ffff:169.254.x.y`).
 *
 * Returns an error message if blocked, or `null` if allowed.
 */
export async function validateDbHost(
  creds: PostgresCredentials,
): Promise<string | null> {
  const host = extractHost(creds);
  if (!host) {
    return "Could not determine target host from the provided credentials.";
  }

  // First check the literal host string (catches raw IPs without DNS lookup)
  if (isBlockedIp(host)) {
    return `Connection to "${host}" is blocked: link-local and metadata addresses are not allowed.`;
  }

  // Resolve DNS and check all resulting IPs
  try {
    const results = await dnsLookupAll(host, { all: true });
    const addresses = Array.isArray(results) ? results : [results];
    for (const entry of addresses) {
      const ip =
        typeof entry === "string"
          ? entry
          : (entry as { address: string }).address;
      // Strip IPv6-mapped IPv4 prefix (::ffff:169.254.x.y → 169.254.x.y)
      const normalized = ip.replace(/^::ffff:/i, "");
      if (isBlockedIp(normalized)) {
        return (
          `Connection to "${host}" is blocked: it resolves to ${ip} ` +
          `which is a link-local or metadata address.`
        );
      }
    }
  } catch {
    // DNS resolution failed — let the Postgres client handle the error
    // rather than blocking legitimate hostnames that may be temporarily
    // unresolvable from this context
  }

  return null;
}

/** Convert a JS value to a SQL literal for use in raw queries. */
export function sqlLiteral(v: unknown): string {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  if (typeof v === "object")
    return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
  return `'${String(v).replace(/'/g, "''")}'`;
}

/** Build a "col = val" SQL assignment clause. */
export function sqlAssign(col: string, val: unknown): string {
  if (val === null || val === undefined) return `${quoteIdent(col)} = NULL`;
  return `${quoteIdent(col)} = ${sqlLiteral(val)}`;
}

/** Build a "col = val" or "col IS NULL" SQL WHERE predicate. */
export function sqlPredicate(col: string, val: unknown): string {
  if (val === null || val === undefined) return `${quoteIdent(col)} IS NULL`;
  return `${quoteIdent(col)} = ${sqlLiteral(val)}`;
}

// Cached drizzle-orm sql helper; resolved once on first call.
let _sqlHelper: { raw: (query: string) => { queryChunks: unknown[] } } | null =
  null;
async function getDrizzleSql(): Promise<typeof _sqlHelper> {
  if (!_sqlHelper) {
    const drizzle = await import("drizzle-orm");
    _sqlHelper = drizzle.sql;
  }
  return _sqlHelper;
}

/** Execute raw SQL via the runtime's Drizzle adapter. */
export async function executeRawSql(
  runtime: AgentRuntime,
  sqlText: string,
): Promise<{ rows: Record<string, unknown>[]; columns: string[] }> {
  const drizzleSql = await getDrizzleSql();
  const db = runtime.adapter.db as {
    execute(query: { queryChunks: unknown[] }): Promise<{
      rows: Record<string, unknown>[];
      fields?: Array<{ name: string }>;
    }>;
  };
  const rawQuery = drizzleSql?.raw(sqlText);
  if (!rawQuery) throw new Error("SQL module not available");
  const result = await db.execute(rawQuery);
  const rows = Array.isArray(result.rows)
    ? result.rows
    : (result as unknown as Record<string, unknown>[]);

  let columns: string[] = [];
  if (result.fields && Array.isArray(result.fields)) {
    columns = result.fields.map((f: { name: string }) => f.name);
  } else if (rows.length > 0) {
    columns = Object.keys(rows[0]);
  }

  return { rows, columns };
}

/**
 * Detect the current database provider from environment / runtime state.
 */
export function detectCurrentProvider(): DatabaseProviderType {
  return process.env.POSTGRES_URL ? "postgres" : "pglite";
}

/** Verify a table name refers to a real user table. */
export async function assertTableExists(
  runtime: AgentRuntime,
  tableName: string,
): Promise<boolean> {
  const safe = tableName.replace(/'/g, "''");
  const { rows } = await executeRawSql(
    runtime,
    `SELECT 1 FROM information_schema.tables
     WHERE table_name = '${safe}'
       AND table_schema NOT IN ('pg_catalog', 'information_schema')
       AND table_type = 'BASE TABLE'
     LIMIT 1`,
  );
  return rows.length > 0;
}

// ---------------------------------------------------------------------------
// Service Functions
// ---------------------------------------------------------------------------

export async function getDatabaseStatus(
  runtime: AgentRuntime | null,
): Promise<DatabaseStatus> {
  const provider = detectCurrentProvider();
  if (!runtime?.adapter) {
    return {
      provider,
      connected: false,
      serverVersion: null,
      tableCount: 0,
      pgliteDataDir: process.env.PGLITE_DATA_DIR ?? null,
      postgresHost: null,
    };
  }

  const { rows } = await executeRawSql(runtime, "SELECT version()");
  const serverVersion =
    rows.length > 0
      ? String((rows[0] as Record<string, unknown>).version ?? "")
      : null;

  const tableResult = await executeRawSql(
    runtime,
    `SELECT count(*)::int AS cnt
       FROM information_schema.tables
      WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
        AND table_type = 'BASE TABLE'`,
  );
  const tableCount =
    tableResult.rows.length > 0
      ? Number((tableResult.rows[0] as Record<string, unknown>).cnt ?? 0)
      : 0;

  return {
    provider,
    connected: true,
    serverVersion,
    tableCount,
    pgliteDataDir:
      provider === "pglite" ? (process.env.PGLITE_DATA_DIR ?? null) : null,
    postgresHost:
      provider === "postgres"
        ? (process.env.POSTGRES_URL?.replace(
            /^postgresql:\/\/[^@]*@/,
            "",
          ).replace(/\/.*$/, "") ?? null)
        : null,
  };
}

export function getDatabaseConfig(): {
  config: DatabaseConfig;
  activeProvider: DatabaseProviderType;
  needsRestart: boolean;
} {
  const config = loadMilaidyConfig();
  const dbConfig: DatabaseConfig = config.database ?? { provider: "pglite" };
  // Mask the password in the response
  const sanitized = { ...dbConfig };
  if (sanitized.postgres?.password) {
    sanitized.postgres = {
      ...sanitized.postgres,
      password: "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022",
    };
  }
  if (sanitized.postgres?.connectionString) {
    // Mask password in connection string
    sanitized.postgres = {
      ...sanitized.postgres,
      connectionString: sanitized.postgres.connectionString.replace(
        /:([^@]+)@/,
        ":\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022@",
      ),
    };
  }
  return {
    config: sanitized,
    activeProvider: detectCurrentProvider(),
    needsRestart: (dbConfig.provider ?? "pglite") !== detectCurrentProvider(),
  };
}

export async function saveDatabaseConfig(body: DatabaseConfig): Promise<{
  saved: boolean;
  config: DatabaseConfig;
  needsRestart: boolean;
}> {
  // Validate
  if (
    body.provider &&
    body.provider !== "pglite" &&
    body.provider !== "postgres"
  ) {
    throw new Error(
      `Invalid provider: ${String(body.provider)}. Must be "pglite" or "postgres".`,
    );
  }

  if (body.provider === "postgres" && body.postgres) {
    const pg = body.postgres;
    if (!pg.connectionString && !pg.host) {
      throw new Error(
        "Postgres configuration requires either a connectionString or at least a host.",
      );
    }

    const hostError = await validateDbHost(pg);
    if (hostError) {
      throw new Error(hostError);
    }
  }

  // Load current config, merge database section, save
  const config = loadMilaidyConfig();
  const existingDb = config.database ?? {};

  // Merge: keep existing postgres/pglite sub-configs unless explicitly provided
  const merged: DatabaseConfig = {
    ...existingDb,
    ...body,
  };

  // If switching to postgres, ensure postgres config is present
  if (merged.provider === "postgres" && body.postgres) {
    merged.postgres = { ...existingDb.postgres, ...body.postgres };
  }
  // If switching to pglite, ensure pglite config is present
  if (merged.provider === "pglite" && body.pglite) {
    merged.pglite = { ...existingDb.pglite, ...body.pglite };
  }

  config.database = merged;
  saveMilaidyConfig(config);

  logger.info(
    { src: "database-service", provider: merged.provider },
    "Database configuration saved",
  );

  return {
    saved: true,
    config: merged,
    needsRestart: (merged.provider ?? "pglite") !== detectCurrentProvider(),
  };
}

export async function testDatabaseConnection(
  body: PostgresCredentials,
): Promise<ConnectionTestResult> {
  const hostError = await validateDbHost(body);
  if (hostError) {
    return {
      success: false,
      serverVersion: null,
      error: hostError,
      durationMs: 0,
    };
  }

  const connectionString = buildConnectionString(body);
  const start = Date.now();

  // Dynamically import pg to avoid hard-coupling (it is a peer dep via plugin-sql)
  let Pool: typeof import("pg").Pool;
  try {
    const pgModule = await import("pg");
    Pool = pgModule.default?.Pool ?? pgModule.Pool;
  } catch {
    return {
      success: false,
      serverVersion: null,
      error:
        "PostgreSQL client library (pg) is not available. Ensure @elizaos/plugin-sql is installed.",
      durationMs: Date.now() - start,
    };
  }

  const pool = new Pool({
    connectionString,
    max: 1,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 5000,
  });

  let client: import("pg").PoolClient | null = null;
  try {
    client = await pool.connect();
    const versionResult = await client.query("SELECT version()");
    const serverVersion = String(versionResult.rows[0]?.version ?? "");
    const durationMs = Date.now() - start;

    return {
      success: true,
      serverVersion,
      error: null,
      durationMs,
    };
  } catch (err) {
    const durationMs = Date.now() - start;
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      serverVersion: null,
      error: message,
      durationMs,
    };
  } finally {
    if (client) client.release();
    await pool.end();
  }
}

export async function getTables(runtime: AgentRuntime): Promise<TableInfo[]> {
  // Get all user tables
  const tablesResult = await executeRawSql(
    runtime,
    `SELECT
       t.table_schema AS schema,
       t.table_name AS name,
       COALESCE(s.n_live_tup, 0)::int AS row_count
     FROM information_schema.tables t
     LEFT JOIN pg_stat_user_tables s
       ON s.schemaname = t.table_schema
       AND s.relname = t.table_name
     WHERE t.table_schema NOT IN ('pg_catalog', 'information_schema')
       AND t.table_type = 'BASE TABLE'
     ORDER BY t.table_schema, t.table_name`,
  );

  // Get columns for all tables in one query
  const columnsResult = await executeRawSql(
    runtime,
    `SELECT
       c.table_schema AS schema,
       c.table_name AS table_name,
       c.column_name AS name,
       c.data_type AS type,
       (c.is_nullable = 'YES') AS nullable,
       c.column_default AS default_value,
       COALESCE(
         (SELECT true
          FROM information_schema.table_constraints tc
          JOIN information_schema.key_column_usage kcu
            ON tc.constraint_name = kcu.constraint_name
           AND tc.table_schema = kcu.table_schema
          WHERE tc.constraint_type = 'PRIMARY KEY'
            AND tc.table_schema = c.table_schema
            AND tc.table_name = c.table_name
            AND kcu.column_name = c.column_name),
         false
       ) AS is_primary_key
     FROM information_schema.columns c
     WHERE c.table_schema NOT IN ('pg_catalog', 'information_schema')
     ORDER BY c.table_schema, c.table_name, c.ordinal_position`,
  );

  // Group columns by table
  const columnsByTable = new Map<string, ColumnInfo[]>();
  for (const row of columnsResult.rows) {
    const key = `${String(row.schema)}.${String(row.table_name)}`;
    const cols = columnsByTable.get(key) ?? [];
    cols.push({
      name: String(row.name),
      type: String(row.type),
      nullable: Boolean(row.nullable),
      defaultValue:
        row.default_value != null ? String(row.default_value) : null,
      isPrimaryKey: Boolean(row.is_primary_key),
    });
    columnsByTable.set(key, cols);
  }

  const tables: TableInfo[] = tablesResult.rows.map((row) => {
    const key = `${String(row.schema)}.${String(row.name)}`;
    return {
      name: String(row.name),
      schema: String(row.schema),
      rowCount: Number(row.row_count ?? 0),
      columns: columnsByTable.get(key) ?? [],
    };
  });

  return tables;
}

export async function getRows(
  runtime: AgentRuntime,
  tableName: string,
  params: {
    offset: number;
    limit: number;
    sortCol: string;
    sortOrder: string;
    search: string;
  },
): Promise<{
  table: string;
  rows: Record<string, unknown>[];
  columns: string[];
  total: number;
  offset: number;
  limit: number;
}> {
  if (!(await assertTableExists(runtime, tableName))) {
    throw new Error(`Table "${tableName}" not found`); // Will be caught and return 404/500
  }

  // Get column names for this table (for search and sort validation)
  const safeTableName = tableName.replace(/'/g, "''");
  const colResult = await executeRawSql(
    runtime,
    `SELECT column_name, data_type
     FROM information_schema.columns
     WHERE table_name = '${safeTableName}'
       AND table_schema NOT IN ('pg_catalog', 'information_schema')
     ORDER BY ordinal_position`,
  );
  const columnNames = colResult.rows.map((r) => String(r.column_name));
  const columnTypes = new Map(
    colResult.rows.map((r) => [String(r.column_name), String(r.data_type)]),
  );

  // Validate sort column
  const validSort =
    params.sortCol && columnNames.includes(params.sortCol)
      ? params.sortCol
      : "";

  // Build search clause: search across all text-castable columns
  let whereClause = "";
  if (params.search.trim()) {
    // Escape ILIKE special characters: backslash first (since it becomes
    // the escape character), then the ILIKE wildcards % and _.
    const escapedSearch = params.search
      .replace(/'/g, "''")
      .replace(/\\/g, "\\\\")
      .replace(/%/g, "\\%")
      .replace(/_/g, "\\_");
    const textColumns = columnNames.filter((col) => {
      const t = columnTypes.get(col) ?? "";
      return (
        t.includes("char") ||
        t.includes("text") ||
        t === "uuid" ||
        t === "jsonb" ||
        t === "json" ||
        t === "integer" ||
        t === "bigint" ||
        t === "numeric" ||
        t === "timestamp" ||
        t.includes("timestamp")
      );
    });
    if (textColumns.length > 0) {
      const conditions = textColumns.map(
        (col) =>
          `${quoteIdent(col)}::text ILIKE '%${escapedSearch}%' ESCAPE '\\'`,
      );
      whereClause = `WHERE (${conditions.join(" OR ")})`;
    }
  }

  // Count total (with search filter)
  const countResult = await executeRawSql(
    runtime,
    `SELECT count(*)::int AS total FROM ${quoteIdent(tableName)} ${whereClause}`,
  );
  const total = Number(
    (countResult.rows[0] as Record<string, unknown>)?.total ?? 0,
  );

  // Fetch rows
  const orderClause = validSort
    ? `ORDER BY ${quoteIdent(validSort)} ${params.sortOrder}`
    : "";
  const query = `SELECT * FROM ${quoteIdent(tableName)} ${whereClause} ${orderClause} LIMIT ${params.limit} OFFSET ${params.offset}`;

  const result = await executeRawSql(runtime, query);

  return {
    table: tableName,
    rows: result.rows,
    columns: result.columns,
    total,
    offset: params.offset,
    limit: params.limit,
  };
}

export async function insertRow(
  runtime: AgentRuntime,
  tableName: string,
  data: Record<string, unknown>,
): Promise<{ inserted: boolean; row: Record<string, unknown> | null }> {
  if (
    !data ||
    typeof data !== "object" ||
    Object.keys(data).length === 0
  ) {
    throw new Error("Request body must include a non-empty 'data' object.");
  }

  if (!(await assertTableExists(runtime, tableName))) {
    throw new Error(`Table "${tableName}" not found`);
  }

  const columns = Object.keys(data);
  const values = Object.values(data);
  const colList = columns.map((c) => quoteIdent(c)).join(", ");
  const valList = values.map(sqlLiteral).join(", ");

  const result = await executeRawSql(
    runtime,
    `INSERT INTO ${quoteIdent(tableName)} (${colList}) VALUES (${valList}) RETURNING *`,
  );

  return { inserted: true, row: result.rows[0] ?? null };
}

export async function updateRow(
  runtime: AgentRuntime,
  tableName: string,
  where: Record<string, unknown>,
  data: Record<string, unknown>,
): Promise<{ updated: boolean; row: Record<string, unknown> }> {
  if (!where || Object.keys(where).length === 0) {
    throw new Error(
      "Request body must include a non-empty 'where' object for row identification.",
    );
  }
  if (!data || Object.keys(data).length === 0) {
    throw new Error(
      "Request body must include a non-empty 'data' object with fields to update.",
    );
  }

  const setClauses = Object.entries(data).map(([col, val]) =>
    sqlAssign(col, val),
  );
  const whereClauses = Object.entries(where).map(([col, val]) =>
    sqlPredicate(col, val),
  );

  const result = await executeRawSql(
    runtime,
    `UPDATE ${quoteIdent(tableName)}
        SET ${setClauses.join(", ")}
      WHERE ${whereClauses.join(" AND ")}
      RETURNING *`,
  );

  if (result.rows.length === 0) {
    throw new Error("No matching row found to update.");
  }

  return { updated: true, row: result.rows[0] };
}

export async function deleteRow(
  runtime: AgentRuntime,
  tableName: string,
  where: Record<string, unknown>,
): Promise<{ deleted: boolean; row: Record<string, unknown> }> {
  if (!where || Object.keys(where).length === 0) {
    throw new Error(
      "Request body must include a non-empty 'where' object for row identification.",
    );
  }

  const whereClauses = Object.entries(where).map(([col, val]) =>
    sqlPredicate(col, val),
  );

  const result = await executeRawSql(
    runtime,
    `DELETE FROM ${quoteIdent(tableName)}
      WHERE ${whereClauses.join(" AND ")}
      RETURNING *`,
  );

  if (result.rows.length === 0) {
    throw new Error("No matching row found to delete.");
  }

  return { deleted: true, row: result.rows[0] };
}

export async function executeSafeQuery(
  runtime: AgentRuntime,
  sql: string,
  readOnly: boolean,
): Promise<QueryResult> {
  const sqlText = sql.trim();

  // If readOnly mode, reject mutation statements.
  // Strip SQL comments, then scan for mutation keywords *anywhere* in the
  // query — not just the leading keyword. This prevents bypass via CTEs
  // (WITH ... AS (DELETE ...)) and other SQL constructs that nest mutations.
  if (readOnly) {
    // Strip block comments (/* ... */) and line comments (-- ...).
    // Use empty-string replacement (not space) to mirror how PostgreSQL
    // concatenates tokens across comments — e.g. DE/* */LETE → DELETE.
    // A space replacement would turn it into "DE LETE", hiding the keyword.
    const stripped = sqlText
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/--.*$/gm, "")
      .trim();

    // Strip string literals so that keywords inside quoted strings are ignored.
    // Handles single-quoted ('...'), dollar-quoted ($$...$$), and tagged
    // dollar-quoted ($tag$...$tag$) strings, plus double-quoted identifiers.
    const noStrings = stripped
      .replace(/\$([A-Za-z0-9_]*)\$[\s\S]*?\$\1\$/g, " ")
      .replace(/'(?:[^']|'')*'/g, " ")
      .replace(/"(?:[^"]|"")*"/g, " ");

    const mutationKeywords = [
      "INSERT",
      "UPDATE",
      "DELETE",
      "DROP",
      "ALTER",
      "TRUNCATE",
      "CREATE",
      "GRANT",
      "REVOKE",
    ];
    // Match mutation keywords as whole words (word boundary) anywhere in the
    // query, catching them inside CTEs, subqueries, etc.
    const mutationPattern = new RegExp(
      `\\b(${mutationKeywords.join("|")})\\b`,
      "i",
    );
    const match = mutationPattern.exec(noStrings);
    if (match) {
      throw new Error(
        `Query rejected: "${match[1].toUpperCase()}" is a mutation keyword. Set readOnly: false to execute mutations.`,
      );
    }
    // Reject multi-statement queries (naive: any semicolon not at the very end)
    const trimmedForSemicolon = stripped.replace(/;\s*$/, "");
    if (trimmedForSemicolon.includes(";")) {
      throw new Error(
        "Query rejected: multi-statement queries are not allowed in read-only mode.",
      );
    }
  }

  const start = Date.now();
  const result = await executeRawSql(runtime, sqlText);
  const durationMs = Date.now() - start;

  return {
    columns: result.columns,
    rows: result.rows,
    rowCount: result.rows.length,
    durationMs,
  };
}
