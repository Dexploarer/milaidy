import type http from "node:http";
import type { ServerState } from "../types.js";
import { decodePathComponent, error, json } from "../utils.js";

export async function handleRegistryRoutes(
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

  // ── GET /api/registry/plugins ──────────────────────────────────────────
  if (method === "GET" && pathname === "/api/registry/plugins") {
    const { getRegistryPlugins } = await import(
      "../../services/registry-client.js"
    );
    const { listInstalledPlugins: listInstalled } = await import(
      "../../services/plugin-installer.js"
    );
    try {
      const registry = await getRegistryPlugins();
      const installed = await listInstalled();
      const installedNames = new Set(installed.map((p) => p.name));

      // Also check which plugins are loaded in the runtime
      const loadedNames = state.runtime
        ? new Set(state.runtime.plugins.map((p) => p.name))
        : new Set<string>();

      // Cross-reference with bundled manifest so the Store can hide them
      const bundledIds = new Set(state.plugins.map((p) => p.id));

      const plugins = Array.from(registry.values()).map((p) => {
        const shortId = p.name
          .replace(/^@[^/]+\/plugin-/, "")
          .replace(/^@[^/]+\//, "")
          .replace(/^plugin-/, "");
        return {
          ...p,
          installed: installedNames.has(p.name),
          installedVersion:
            installed.find((i) => i.name === p.name)?.version ?? null,
          loaded:
            loadedNames.has(p.name) ||
            loadedNames.has(p.name.replace("@elizaos/", "")),
          bundled: bundledIds.has(shortId),
        };
      });
      json(res, { count: plugins.length, plugins });
    } catch (err) {
      error(
        res,
        `Failed to fetch registry: ${err instanceof Error ? err.message : String(err)}`,
        502,
      );
    }
    return true;
  }

  // ── GET /api/registry/plugins/:name ─────────────────────────────────────
  if (
    method === "GET" &&
    pathname.startsWith("/api/registry/plugins/") &&
    pathname.length > "/api/registry/plugins/".length
  ) {
    const name = decodePathComponent(
      pathname.slice("/api/registry/plugins/".length),
      res,
      "plugin name",
    );
    if (name === null) return true;
    const { getPluginInfo } = await import("../../services/registry-client.js");

    try {
      const info = await getPluginInfo(name);
      if (!info) {
        error(res, `Plugin "${name}" not found in registry`, 404);
        return true;
      }
      json(res, { plugin: info });
    } catch (err) {
      error(
        res,
        `Failed to look up plugin: ${err instanceof Error ? err.message : String(err)}`,
        502,
      );
    }
    return true;
  }

  // ── GET /api/registry/search?q=... ──────────────────────────────────────
  if (method === "GET" && pathname === "/api/registry/search") {
    const query = url.searchParams.get("q") || "";
    if (!query.trim()) {
      error(res, "Query parameter 'q' is required", 400);
      return true;
    }

    const { searchPlugins } = await import("../../services/registry-client.js");

    try {
      const limitParam = url.searchParams.get("limit");
      const limit = limitParam
        ? Math.min(Math.max(Number(limitParam), 1), 50)
        : 15;
      const results = await searchPlugins(query, limit);
      json(res, { query, count: results.length, results });
    } catch (err) {
      error(
        res,
        `Search failed: ${err instanceof Error ? err.message : String(err)}`,
        502,
      );
    }
    return true;
  }

  // ── POST /api/registry/refresh ──────────────────────────────────────────
  if (method === "POST" && pathname === "/api/registry/refresh") {
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
