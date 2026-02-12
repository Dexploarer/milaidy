import type http from "node:http";
import type { ServerState } from "../types.js";
import { decodePathComponent, error, json, readJsonBody } from "../utils.js";

export async function handleAppRoutes(
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

  // ── App routes (/api/apps/*) ──────────────────────────────────────────
  if (method === "GET" && pathname === "/api/apps") {
    const apps = await state.appManager.listAvailable();
    json(res, apps);
    return true;
  }

  if (method === "GET" && pathname === "/api/apps/search") {
    const query = url.searchParams.get("q") ?? "";
    if (!query.trim()) {
      json(res, []);
      return true;
    }
    const limitStr = url.searchParams.get("limit");
    const limit = limitStr
      ? Math.min(Math.max(parseInt(limitStr, 10), 1), 50)
      : 15;
    const results = await state.appManager.search(query, limit);
    json(res, results);
    return true;
  }

  if (method === "GET" && pathname === "/api/apps/installed") {
    json(res, state.appManager.listInstalled());
    return true;
  }

  if (method === "POST" && pathname === "/api/apps/launch") {
    const body = await readJsonBody<{ name?: string }>(req, res);
    if (!body) return true;
    if (!body.name?.trim()) {
      error(res, "name is required");
      return true;
    }
    const result = await state.appManager.launch(body.name.trim());
    json(res, result);
    return true;
  }

  if (method === "GET" && pathname.startsWith("/api/apps/info/")) {
    const appName = decodePathComponent(
      pathname.slice("/api/apps/info/".length),
      res,
      "app name",
    );
    if (appName === null) return true;
    if (!appName) {
      error(res, "app name is required");
      return true;
    }
    const info = await state.appManager.getInfo(appName);
    if (!info) {
      error(res, `App "${appName}" not found in registry`, 404);
      return true;
    }
    json(res, info);
    return true;
  }

  // ── GET /api/apps/plugins — non-app plugins from registry ───────────
  if (method === "GET" && pathname === "/api/apps/plugins") {
    const { listNonAppPlugins } = await import(
      "../../services/registry-client.js"
    );
    try {
      const plugins = await listNonAppPlugins();
      json(res, plugins);
    } catch (err) {
      error(
        res,
        `Failed to list plugins: ${err instanceof Error ? err.message : String(err)}`,
        502,
      );
    }
    return true;
  }

  // ── GET /api/apps/plugins/search?q=... — search non-app plugins ─────
  if (method === "GET" && pathname === "/api/apps/plugins/search") {
    const query = url.searchParams.get("q") ?? "";
    if (!query.trim()) {
      json(res, []);
      return true;
    }
    const { searchNonAppPlugins } = await import(
      "../../services/registry-client.js"
    );
    try {
      const limitStr = url.searchParams.get("limit");
      const limit = limitStr
        ? Math.min(Math.max(parseInt(limitStr, 10), 1), 50)
        : 15;
      const results = await searchNonAppPlugins(query, limit);
      json(res, results);
    } catch (err) {
      error(
        res,
        `Plugin search failed: ${err instanceof Error ? err.message : String(err)}`,
        502,
      );
    }
    return true;
  }

  // ── POST /api/apps/refresh — refresh the registry cache ─────────────
  if (method === "POST" && pathname === "/api/apps/refresh") {
    const { refreshRegistry } = await import(
      "../../services/registry-client.js"
    );
    try {
      const registry = await refreshRegistry();
      json(res, { ok: true, count: registry.size });
    } catch (err) {
      error(
        res,
        `Refresh failed: ${err instanceof Error ? err.message : String(err)}`,
        502,
      );
    }
    return true;
  }

  return false;
}
