import http from "node:http";
import { logger } from "@elizaos/core";
import {
  type ServerState,
  type PluginEntry,
  type RequestContext,
} from "../types.js";
import { readJsonBody, json, error, decodePathComponent, maskValue } from "../utils.js";
import {
  discoverInstalledPlugins,
} from "../discovery.js";
import {
  type PluginParamInfo,
  validatePluginConfig,
} from "../plugin-validation.js";
import { loadMilaidyConfig, saveMilaidyConfig } from "../../config/config.js";

export async function handlePluginsRoute(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  pathname: string,
  method: string,
  state: ServerState,
  ctx?: RequestContext
): Promise<boolean> {
  const url = new URL(
    req.url ?? "/",
    `http://${req.headers.host ?? "localhost"}`,
  );

  // ── GET /api/plugins ────────────────────────────────────────────────────
  if (method === "GET" && pathname === "/api/plugins") {
    // Re-read config from disk so we pick up plugins installed since server start.
    let freshConfig;
    try {
      freshConfig = loadMilaidyConfig();
    } catch {
      freshConfig = state.config;
    }

    // Merge user-installed plugins into the list (they don't exist in plugins.json)
    const bundledIds = new Set(state.plugins.map((p) => p.id));
    const installedEntries = discoverInstalledPlugins(freshConfig, bundledIds);
    const allPlugins: PluginEntry[] = [...state.plugins, ...installedEntries];

    // Update enabled status from runtime (if available)
    if (state.runtime) {
      const loadedNames = state.runtime.plugins.map((p) => p.name);
      for (const plugin of allPlugins) {
        const suffix = `plugin-${plugin.id}`;
        const packageName = `@elizaos/plugin-${plugin.id}`;
        const isLoaded = loadedNames.some((name) => {
          return (
            name === plugin.id ||
            name === suffix ||
            name === packageName ||
            name.endsWith(`/${suffix}`) ||
            name.includes(plugin.id)
          );
        });
        plugin.enabled = isLoaded;
        plugin.isActive = isLoaded;
      }
    }

    // Always refresh current env values and re-validate
    for (const plugin of allPlugins) {
      for (const param of plugin.parameters) {
        const envValue = process.env[param.key];
        param.isSet = Boolean(envValue?.trim());
        param.currentValue = param.isSet
          ? param.sensitive
            ? maskValue(envValue ?? "")
            : (envValue ?? "")
          : null;
      }
      const paramInfos: PluginParamInfo[] = plugin.parameters.map((p) => ({
        key: p.key,
        required: p.required,
        sensitive: p.sensitive,
        type: p.type,
        description: p.description,
        default: p.default,
      }));
      const validation = validatePluginConfig(
        plugin.id,
        plugin.category,
        plugin.envKey,
        plugin.configKeys,
        undefined,
        paramInfos,
      );
      plugin.validationErrors = validation.errors;
      plugin.validationWarnings = validation.warnings;
    }

    json(res, { plugins: allPlugins });
    return true;
  }

  // ── PUT /api/plugins/:id ────────────────────────────────────────────────
  if (method === "PUT" && pathname.startsWith("/api/plugins/")) {
    const pluginId = pathname.slice("/api/plugins/".length);
    const body = await readJsonBody<{
      enabled?: boolean;
      config?: Record<string, string>;
    }>(req, res);
    if (!body) return true;

    const plugin = state.plugins.find((p) => p.id === pluginId);
    if (!plugin) {
      error(res, `Plugin "${pluginId}" not found`, 404);
      return true;
    }

    if (body.enabled !== undefined) {
      plugin.enabled = body.enabled;
    }
    if (body.config) {
      const pluginParamInfos: PluginParamInfo[] = plugin.parameters.map(
        (p) => ({
          key: p.key,
          required: p.required,
          sensitive: p.sensitive,
          type: p.type,
          description: p.description,
          default: p.default,
        }),
      );
      const configValidation = validatePluginConfig(
        pluginId,
        plugin.category,
        plugin.envKey,
        Object.keys(body.config),
        body.config,
        pluginParamInfos,
      );

      if (!configValidation.valid) {
        json(
          res,
          { ok: false, plugin, validationErrors: configValidation.errors },
          422,
        );
        return true;
      }

      for (const [key, value] of Object.entries(body.config)) {
        if (typeof value === "string" && value.trim()) {
          process.env[key] = value;
        }
      }
      plugin.configured = true;
    }

    // Refresh validation
    const refreshParamInfos: PluginParamInfo[] = plugin.parameters.map((p) => ({
      key: p.key,
      required: p.required,
      sensitive: p.sensitive,
      type: p.type,
      description: p.description,
      default: p.default,
    }));
    const updated = validatePluginConfig(
      pluginId,
      plugin.category,
      plugin.envKey,
      plugin.configKeys,
      undefined,
      refreshParamInfos,
    );
    plugin.validationErrors = updated.errors;
    plugin.validationWarnings = updated.warnings;

    // Update config.plugins.allow for hot-reload
    if (body.enabled !== undefined) {
      const packageName = `@elizaos/plugin-${pluginId}`;

      // Initialize plugins.allow if it doesn't exist
      if (!state.config.plugins) {
        state.config.plugins = {};
      }
      if (!state.config.plugins.allow) {
        state.config.plugins.allow = [];
      }

      const allowList = state.config.plugins.allow as string[];
      const index = allowList.indexOf(packageName);

      if (body.enabled && index === -1) {
        // Add plugin to allow list
        allowList.push(packageName);
        logger.info(`[milaidy-api] Enabled plugin: ${packageName}`);
      } else if (!body.enabled && index !== -1) {
        // Remove plugin from allow list
        allowList.splice(index, 1);
        logger.info(`[milaidy-api] Disabled plugin: ${packageName}`);
      }

      // Persist capability toggle state in config.features so the runtime
      // can gate related behaviour (e.g. disabling image description when
      // vision is toggled off).
      const CAPABILITY_FEATURE_IDS = new Set([
        "vision",
        "browser",
        "computeruse",
      ]);
      if (CAPABILITY_FEATURE_IDS.has(pluginId)) {
        if (!state.config.features) {
          state.config.features = {};
        }
        state.config.features[pluginId] = body.enabled;
      }

      // Save updated config
      try {
        saveMilaidyConfig(state.config);
      } catch (err) {
        logger.warn(
          `[milaidy-api] Failed to save config: ${err instanceof Error ? err.message : err}`,
        );
      }

      // Trigger runtime restart if available
      if (ctx?.onRestart) {
        logger.info("[milaidy-api] Triggering runtime restart...");
        ctx
          .onRestart()
          .then((newRuntime) => {
            if (newRuntime) {
              state.runtime = newRuntime;
              state.agentState = "running";
              state.agentName = newRuntime.character.name ?? "Milaidy";
              state.startedAt = Date.now();
              logger.info("[milaidy-api] Runtime restarted successfully");
            } else {
              logger.warn("[milaidy-api] Runtime restart returned null");
            }
          })
          .catch((err) => {
            logger.error(
              `[milaidy-api] Runtime restart failed: ${err instanceof Error ? err.message : err}`,
            );
          });
      }
    }

    json(res, { ok: true, plugin });
    return true;
  }

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
    const { refreshRegistry } = await import("../../services/registry-client.js");

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

  // ── POST /api/plugins/install ───────────────────────────────────────────
  if (method === "POST" && pathname === "/api/plugins/install") {
    const body = await readJsonBody<{ name: string; autoRestart?: boolean }>(
      req,
      res,
    );
    if (!body) return true;
    const pluginName = body.name?.trim();

    if (!pluginName) {
      error(res, "Request body must include 'name' (plugin package name)", 400);
      return true;
    }

    const { installPlugin } = await import("../../services/plugin-installer.js");

    try {
      const result = await installPlugin(pluginName, (progress) => {
        logger.info(`[install] ${progress.phase}: ${progress.message}`);
      });

      if (!result.success) {
        json(res, { ok: false, error: result.error }, 422);
        return true;
      }

      // If autoRestart is not explicitly false, restart the agent
      if (body.autoRestart !== false && result.requiresRestart) {
        const { requestRestart } = await import("../../runtime/restart.js");
        // Defer the restart so the HTTP response is sent first
        setTimeout(() => {
          Promise.resolve(
            requestRestart(`Plugin ${result.pluginName} installed`),
          ).catch((err) => {
            logger.error(
              `[api] Restart after install failed: ${err instanceof Error ? err.message : String(err)}`,
            );
          });
        }, 500);
      }

      json(res, {
        ok: true,
        plugin: {
          name: result.pluginName,
          version: result.version,
          installPath: result.installPath,
        },
        requiresRestart: result.requiresRestart,
        message: result.requiresRestart
          ? `${result.pluginName} installed. Agent will restart to load it.`
          : `${result.pluginName} installed.`,
      });
    } catch (err) {
      error(
        res,
        `Install failed: ${err instanceof Error ? err.message : String(err)}`,
        500,
      );
    }
    return true;
  }

  // ── POST /api/plugins/uninstall ─────────────────────────────────────────
  if (method === "POST" && pathname === "/api/plugins/uninstall") {
    const body = await readJsonBody<{ name: string; autoRestart?: boolean }>(
      req,
      res,
    );
    if (!body) return true;
    const pluginName = body.name?.trim();

    if (!pluginName) {
      error(res, "Request body must include 'name' (plugin package name)", 400);
      return true;
    }

    const { uninstallPlugin } = await import("../../services/plugin-installer.js");

    try {
      const result = await uninstallPlugin(pluginName);

      if (!result.success) {
        json(res, { ok: false, error: result.error }, 422);
        return true;
      }

      if (body.autoRestart !== false && result.requiresRestart) {
        const { requestRestart } = await import("../../runtime/restart.js");
        setTimeout(() => {
          Promise.resolve(
            requestRestart(`Plugin ${pluginName} uninstalled`),
          ).catch((err) => {
            logger.error(
              `[api] Restart after uninstall failed: ${err instanceof Error ? err.message : String(err)}`,
            );
          });
        }, 500);
      }

      json(res, {
        ok: true,
        pluginName: result.pluginName,
        requiresRestart: result.requiresRestart,
        message: result.requiresRestart
          ? `${pluginName} uninstalled. Agent will restart.`
          : `${pluginName} uninstalled.`,
      });
    } catch (err) {
      error(
        res,
        `Uninstall failed: ${err instanceof Error ? err.message : String(err)}`,
        500,
      );
    }
    return true;
  }

  // ── GET /api/plugins/installed ──────────────────────────────────────────
  if (method === "GET" && pathname === "/api/plugins/installed") {
    const { listInstalledPlugins } = await import(
      "../../services/plugin-installer.js"
    );

    try {
      const installed = await listInstalledPlugins();
      json(res, { count: installed.length, plugins: installed });
    } catch (err) {
      error(
        res,
        `Failed to list installed plugins: ${err instanceof Error ? err.message : String(err)}`,
        500,
      );
    }
    return true;
  }

  // ── GET /api/plugins/core ────────────────────────────────────────────
  if (method === "GET" && pathname === "/api/plugins/core") {
    const { CORE_PLUGINS, OPTIONAL_CORE_PLUGINS } = await import(
      "../../runtime/eliza.js"
    );

    const loadedNames = state.runtime
      ? new Set(state.runtime.plugins.map((p: { name: string }) => p.name))
      : new Set<string>();

    const isLoaded = (npmName: string): boolean => {
      if (loadedNames.has(npmName)) return true;
      const withoutScope = npmName.replace("@elizaos/", "");
      if (loadedNames.has(withoutScope)) return true;
      const shortId = withoutScope.replace("plugin-", "");
      if (loadedNames.has(shortId)) return true;
      for (const n of loadedNames) {
        if (n.includes(shortId) || shortId.includes(n)) return true;
      }
      return false;
    };

    const allowList = new Set(state.config.plugins?.allow ?? []);

    const makeEntry = (npm: string, isCore: boolean) => {
      const id = npm.replace("@elizaos/plugin-", "");
      return {
        npmName: npm,
        id,
        name: id
          .split("-")
          .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(" "),
        isCore,
        loaded: isLoaded(npm),
        enabled: isCore || allowList.has(npm) || allowList.has(id),
      };
    };

    const coreList = CORE_PLUGINS.map((npm: string) => makeEntry(npm, true));
    const optionalList = OPTIONAL_CORE_PLUGINS.map((npm: string) =>
      makeEntry(npm, false),
    );

    json(res, { core: coreList, optional: optionalList });
    return true;
  }

  // ── POST /api/plugins/core/toggle ─────────────────────────────────────
  if (method === "POST" && pathname === "/api/plugins/core/toggle") {
    const body = await readJsonBody<{ npmName: string; enabled: boolean }>(
      req,
      res,
    );
    if (!body || !body.npmName) return true;

    const { CORE_PLUGINS, OPTIONAL_CORE_PLUGINS } = await import(
      "../../runtime/eliza.js"
    );

    const isCorePlugin = (CORE_PLUGINS as readonly string[]).includes(
      body.npmName,
    );
    if (isCorePlugin) {
      error(res, "Core plugins cannot be disabled");
      return true;
    }
    const isOptional = (OPTIONAL_CORE_PLUGINS as readonly string[]).includes(
      body.npmName,
    );
    if (!isOptional) {
      error(res, "Unknown optional plugin");
      return true;
    }

    state.config.plugins = state.config.plugins ?? {};
    state.config.plugins.allow = state.config.plugins.allow ?? [];
    const allow = state.config.plugins.allow;
    const shortId = body.npmName.replace("@elizaos/plugin-", "");

    if (body.enabled) {
      if (!allow.includes(body.npmName) && !allow.includes(shortId)) {
        allow.push(body.npmName);
      }
    } else {
      state.config.plugins.allow = allow.filter(
        (p: string) => p !== body.npmName && p !== shortId,
      );
    }

    try {
      saveMilaidyConfig(state.config);
    } catch (err) {
      logger.warn(
        `[api] Config save failed: ${err instanceof Error ? err.message : err}`,
      );
    }

    try {
      const { requestRestart } = await import("../../runtime/restart.js");
      setTimeout(() => {
        Promise.resolve(
          requestRestart(
            `Plugin ${shortId} ${body.enabled ? "enabled" : "disabled"}`,
          ),
        ).catch(() => {});
      }, 300);
    } catch {
      /* restart module not available */
    }

    json(res, {
      ok: true,
      restarting: true,
      message: `${shortId} ${body.enabled ? "enabled" : "disabled"}. Restarting...`,
    });
    return true;
  }

  return false;
}
