import type http from "node:http";
import { logger } from "@elizaos/core";
import { saveMilaidyConfig } from "../../config/config.js";
import {
  getMcpServerDetails,
  searchMcpMarketplace,
} from "../../services/mcp-marketplace.js";
import type { ServerState } from "../types.js";
import {
  decodePathComponent,
  error,
  json,
  readJsonBody,
  redactDeep,
} from "../utils.js";

export async function handleMcpRoutes(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  pathname: string,
  method: string,
  state: ServerState,
): Promise<boolean> {
  const url = new URL(
    req.url ?? "/",
    `http://${req.headers.host ?? "localhost"}`,
  );

  // ── GET /api/mcp/marketplace/search ──────────────────────────────────
  if (method === "GET" && pathname === "/api/mcp/marketplace/search") {
    const query = url.searchParams.get("q") ?? "";
    const limitStr = url.searchParams.get("limit");
    const limit = limitStr ? Math.min(Math.max(Number(limitStr), 1), 50) : 30;
    try {
      const result = await searchMcpMarketplace(query || undefined, limit);
      json(res, { ok: true, results: result.results });
    } catch (err) {
      error(
        res,
        `MCP marketplace search failed: ${err instanceof Error ? err.message : err}`,
        502,
      );
    }
    return true;
  }

  // ── GET /api/mcp/marketplace/details/:name ───────────────────────────
  if (
    method === "GET" &&
    pathname.startsWith("/api/mcp/marketplace/details/")
  ) {
    const serverName = decodePathComponent(
      pathname.slice("/api/mcp/marketplace/details/".length),
      res,
      "server name",
    );
    if (serverName === null) return true;
    if (!serverName.trim()) {
      error(res, "Server name is required", 400);
      return true;
    }
    try {
      const details = await getMcpServerDetails(serverName);
      if (!details) {
        error(res, `MCP server "${serverName}" not found`, 404);
        return true;
      }
      json(res, { ok: true, server: details });
    } catch (err) {
      error(
        res,
        `Failed to fetch server details: ${err instanceof Error ? err.message : err}`,
        502,
      );
    }
    return true;
  }

  // ── GET /api/mcp/config ──────────────────────────────────────────────
  if (method === "GET" && pathname === "/api/mcp/config") {
    const servers = state.config.mcp?.servers ?? {};
    json(res, { ok: true, servers: redactDeep(servers) });
    return true;
  }

  // ── POST /api/mcp/config/server ──────────────────────────────────────
  if (method === "POST" && pathname === "/api/mcp/config/server") {
    const body = await readJsonBody<{
      name?: string;
      config?: Record<string, unknown>;
    }>(req, res);
    if (!body) return true;

    const serverName = (body.name as string | undefined)?.trim();
    if (!serverName) {
      error(res, "Server name is required", 400);
      return true;
    }

    const config = body.config as Record<string, unknown> | undefined;
    if (!config || typeof config !== "object") {
      error(res, "Server config object is required", 400);
      return true;
    }

    const configType = config.type as string | undefined;
    const validTypes = ["stdio", "http", "streamable-http", "sse"];
    if (!configType || !validTypes.includes(configType)) {
      error(
        res,
        `Invalid config type. Must be one of: ${validTypes.join(", ")}`,
        400,
      );
      return true;
    }

    if (configType === "stdio" && !config.command) {
      error(res, "Command is required for stdio servers", 400);
      return true;
    }

    if (
      (configType === "http" ||
        configType === "streamable-http" ||
        configType === "sse") &&
      !config.url
    ) {
      error(res, "URL is required for remote servers", 400);
      return true;
    }

    if (!state.config.mcp) state.config.mcp = {};
    if (!state.config.mcp.servers) state.config.mcp.servers = {};
    state.config.mcp.servers[serverName] = config as NonNullable<
      NonNullable<typeof state.config.mcp>["servers"]
    >[string];

    try {
      saveMilaidyConfig(state.config);
    } catch (err) {
      logger.warn(
        `[api] Config save failed: ${err instanceof Error ? err.message : err}`,
      );
    }

    json(res, { ok: true, name: serverName, requiresRestart: true });
    return true;
  }

  // ── DELETE /api/mcp/config/server/:name ──────────────────────────────
  if (method === "DELETE" && pathname.startsWith("/api/mcp/config/server/")) {
    const serverName = decodePathComponent(
      pathname.slice("/api/mcp/config/server/".length),
      res,
      "server name",
    );
    if (serverName === null) return true;

    if (state.config.mcp?.servers?.[serverName]) {
      delete state.config.mcp.servers[serverName];
      try {
        saveMilaidyConfig(state.config);
      } catch (err) {
        logger.warn(
          `[api] Config save failed: ${err instanceof Error ? err.message : err}`,
        );
      }
    }

    json(res, { ok: true, requiresRestart: true });
    return true;
  }

  // ── PUT /api/mcp/config ──────────────────────────────────────────────
  if (method === "PUT" && pathname === "/api/mcp/config") {
    const body = await readJsonBody<{
      servers?: Record<string, unknown>;
    }>(req, res);
    if (!body) return true;

    if (!state.config.mcp) state.config.mcp = {};
    if (body.servers && typeof body.servers === "object") {
      state.config.mcp.servers = body.servers as NonNullable<
        NonNullable<typeof state.config.mcp>["servers"]
      >;
    }

    try {
      saveMilaidyConfig(state.config);
    } catch (err) {
      logger.warn(
        `[api] Config save failed: ${err instanceof Error ? err.message : err}`,
      );
    }

    json(res, { ok: true });
    return true;
  }

  // ── GET /api/mcp/status ──────────────────────────────────────────────
  if (method === "GET" && pathname === "/api/mcp/status") {
    const servers: Array<{
      name: string;
      status: string;
      toolCount: number;
      resourceCount: number;
    }> = [];

    // If runtime has an MCP service, enumerate active servers
    if (state.runtime) {
      try {
        const mcpService = state.runtime.getService("MCP") as {
          getServers?: () => Array<{
            name: string;
            status: string;
            tools?: unknown[];
            resources?: unknown[];
          }>;
        } | null;
        if (mcpService && typeof mcpService.getServers === "function") {
          for (const s of mcpService.getServers()) {
            servers.push({
              name: s.name,
              status: s.status,
              toolCount: Array.isArray(s.tools) ? s.tools.length : 0,
              resourceCount: Array.isArray(s.resources)
                ? s.resources.length
                : 0,
            });
          }
        }
      } catch (err) {
        logger.debug(
          `[api] Service not available: ${err instanceof Error ? err.message : err}`,
        );
      }
    }

    json(res, { ok: true, servers });
    return true;
  }

  return false;
}
