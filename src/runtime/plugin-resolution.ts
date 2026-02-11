/**
 * Plugin resolution logic for Milaidy.
 *
 * Handles discovery, loading, and validation of plugins from various sources:
 * - Built-in/npm plugins
 * - User-installed plugins (from ~/.milaidy/plugins/installed/)
 * - Custom/drop-in plugins (from ~/.milaidy/plugins/custom/)
 *
 * @module plugin-resolution
 */
import type { Dirent } from "node:fs";
import { existsSync, symlinkSync } from "node:fs";
import fs from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { logger, type Plugin } from "@elizaos/core";
import { diagnoseNoAIProvider } from "../services/version-compat.js";
import type { MilaidyConfig } from "../config/config.js";
import { resolveStateDir, resolveUserPath } from "../config/paths.js";
import {
  type ApplyPluginAutoEnableParams,
  applyPluginAutoEnable,
} from "../config/plugin-auto-enable.js";
import type { PluginInstallRecord } from "../config/types.milaidy.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A successfully resolved plugin ready for AgentRuntime registration. */
export interface ResolvedPlugin {
  /** npm package name (e.g. "@elizaos/plugin-anthropic"). */
  name: string;
  /** The Plugin instance extracted from the module. */
  plugin: Plugin;
}

/** Shape we expect from a dynamically-imported plugin package. */
export interface PluginModuleShape {
  default?: Plugin;
  plugin?: Plugin;
  [key: string]: Plugin | undefined;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extract a human-readable error message from an unknown thrown value. */
function formatError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// ---------------------------------------------------------------------------
// Plugin resolution constants
// ---------------------------------------------------------------------------

/** Core plugins that should always be loaded. */
export const CORE_PLUGINS: readonly string[] = [
  "@elizaos/plugin-sql", // database adapter — required
  "@elizaos/plugin-local-embedding", // local embeddings — required for memory
  "@elizaos/plugin-agent-skills", // skill execution
  "@elizaos/plugin-agent-orchestrator", // multi-agent orchestration
  "@elizaos/plugin-shell", // shell command execution
  "@elizaos/plugin-plugin-manager", // dynamic plugin management
];

/**
 * Plugins that can be enabled from the admin panel.
 * Not loaded by default — kept separate due to packaging or spec issues.
 */
export const OPTIONAL_CORE_PLUGINS: readonly string[] = [
  "@elizaos/plugin-form", // packaging issue
  "@elizaos/plugin-goals", // spec mismatch
  "@elizaos/plugin-scheduling", // packaging issue
  "@elizaos/plugin-knowledge", // knowledge retrieval — required for RAG
  "@elizaos/plugin-directives", // directive processing
  "@elizaos/plugin-commands", // slash command handling
  "@elizaos/plugin-personality", // personality coherence
  "@elizaos/plugin-experience", // learning from interactions
  "@elizaos/plugin-cli", // CLI interface
  "@elizaos/plugin-code", // code writing and file operations
  "@elizaos/plugin-edge-tts", // text-to-speech
  "@elizaos/plugin-mcp", // MCP protocol support
  "@elizaos/plugin-pdf", // PDF processing
  "@elizaos/plugin-scratchpad", // scratchpad notes
  "@elizaos/plugin-secrets-manager", // secrets management
  "@elizaos/plugin-todo", // todo/task management
  "@elizaos/plugin-trust", // trust scoring
];

/**
 * Optional plugins that require native binaries or specific config.
 * These are only loaded when explicitly enabled via features config,
 * NOT by default — they crash if their prerequisites are missing.
 */
export const _OPTIONAL_NATIVE_PLUGINS: readonly string[] = [
  "@elizaos/plugin-browser", // requires browser server binary
  "@elizaos/plugin-vision", // requires @tensorflow/tfjs-node native addon
  "@elizaos/plugin-cron", // requires worldId at service init
  "@elizaos/plugin-computeruse", // requires platform-specific binaries
];

/** Maps Milaidy channel names to ElizaOS plugin package names. */
export const CHANNEL_PLUGIN_MAP: Readonly<Record<string, string>> = {
  discord: "@elizaos/plugin-discord",
  telegram: "@milaidy/plugin-telegram-enhanced",
  slack: "@elizaos/plugin-slack",
  whatsapp: "@elizaos/plugin-whatsapp",
  signal: "@elizaos/plugin-signal",
  imessage: "@elizaos/plugin-imessage",
  bluebubbles: "@elizaos/plugin-bluebubbles",
  msteams: "@elizaos/plugin-msteams",
  mattermost: "@elizaos/plugin-mattermost",
  googlechat: "@elizaos/plugin-google-chat",
};

/** Maps environment variable names to model-provider plugin packages. */
export const PROVIDER_PLUGIN_MAP: Readonly<Record<string, string>> = {
  ANTHROPIC_API_KEY: "@elizaos/plugin-anthropic",
  OPENAI_API_KEY: "@elizaos/plugin-openai",
  GOOGLE_API_KEY: "@elizaos/plugin-google-genai",
  GOOGLE_GENERATIVE_AI_API_KEY: "@elizaos/plugin-google-genai",
  GROQ_API_KEY: "@elizaos/plugin-groq",
  XAI_API_KEY: "@elizaos/plugin-xai",
  OPENROUTER_API_KEY: "@elizaos/plugin-openrouter",
  AI_GATEWAY_API_KEY: "@elizaos/plugin-vercel-ai-gateway",
  AIGATEWAY_API_KEY: "@elizaos/plugin-vercel-ai-gateway",
  OLLAMA_BASE_URL: "@elizaos/plugin-ollama",
  ZAI_API_KEY: "@homunculuslabs/plugin-zai",
  // ElizaCloud — loaded when API key is present OR cloud is explicitly enabled
  ELIZAOS_CLOUD_API_KEY: "@elizaos/plugin-elizacloud",
  ELIZAOS_CLOUD_ENABLED: "@elizaos/plugin-elizacloud",
};

/**
 * Optional feature plugins keyed by feature name.
 *
 * Currently empty — reserved for future feature→plugin mappings.
 * The lookup code in {@link collectPluginNames} is intentionally kept
 * so new entries work without additional wiring.
 */
export const OPTIONAL_PLUGIN_MAP: Readonly<Record<string, string>> = {
  browser: "@elizaos/plugin-browser",
  vision: "@elizaos/plugin-vision",
  cron: "@elizaos/plugin-cron",
  computeruse: "@elizaos/plugin-computeruse",
  x402: "@elizaos/plugin-x402",
};

export function looksLikePlugin(value: unknown): value is Plugin {
  if (!value || typeof value !== "object") return false;
  const obj = value as Record<string, unknown>;
  return typeof obj.name === "string" && typeof obj.description === "string";
}

export function extractPlugin(mod: PluginModuleShape): Plugin | null {
  // 1. Prefer explicit default export
  if (looksLikePlugin(mod.default)) return mod.default;
  // 2. Check for a named `plugin` export
  if (looksLikePlugin(mod.plugin)) return mod.plugin;
  // 3. Check if the module itself looks like a Plugin (CJS default pattern)
  if (looksLikePlugin(mod)) return mod as unknown as Plugin;
  // 4. Scan named exports for the first value that looks like a Plugin.
  //    This handles packages whose build drops the default export but still
  //    have a named export (e.g. `knowledgePlugin` from plugin-knowledge).
  for (const key of Object.keys(mod)) {
    if (key === "default" || key === "plugin") continue;
    const value = mod[key];
    if (looksLikePlugin(value)) return value;
  }
  return null;
}

/**
 * Collect the set of plugin package names that should be loaded
 * based on config, environment variables, and feature flags.
 */
/** @internal Exported for testing. */
export function collectPluginNames(config: MilaidyConfig): Set<string> {
  // Check for explicit allow list first
  const allowList = config.plugins?.allow;
  const hasExplicitAllowList = allowList && allowList.length > 0;

  // If there's an explicit allow list, respect it and skip auto-detection —
  // but always include essential plugins that the runtime depends on.
  if (hasExplicitAllowList) {
    const names = new Set<string>(allowList);
    // Core plugins are always loaded regardless of allow list.
    for (const core of CORE_PLUGINS) {
      names.add(core);
    }

    const cloudActive = config.cloud?.enabled || Boolean(config.cloud?.apiKey);
    if (cloudActive) {
      // Always include cloud plugin when the user has logged in.
      names.add("@elizaos/plugin-elizacloud");

      // Remove direct AI provider plugins — they would try to call
      // Anthropic/OpenAI/etc. directly (requiring their own API keys)
      // instead of routing through Eliza Cloud.  The cloud plugin handles
      // ALL model calls via its own gateway.
      const directProviders = new Set(Object.values(PROVIDER_PLUGIN_MAP));
      directProviders.delete("@elizaos/plugin-elizacloud"); // keep cloud itself
      for (const p of directProviders) {
        names.delete(p);
      }
    }
    return names;
  }

  // Otherwise, proceed with auto-detection
  const pluginsToLoad = new Set<string>(CORE_PLUGINS);

  // Connector plugins — load when connector has config entries
  // Prefer config.connectors, fall back to config.channels for backward compatibility
  const connectors = config.connectors ?? config.channels ?? {};
  for (const [channelName, channelConfig] of Object.entries(connectors)) {
    if (channelConfig && typeof channelConfig === "object") {
      const pluginName = CHANNEL_PLUGIN_MAP[channelName];
      if (pluginName) {
        pluginsToLoad.add(pluginName);
      }
    }
  }

  // Model-provider plugins — load when env key is present
  for (const [envKey, pluginName] of Object.entries(PROVIDER_PLUGIN_MAP)) {
    if (process.env[envKey]) {
      pluginsToLoad.add(pluginName);
    }
  }

  // plugin-local-embedding provides the TEXT_EMBEDDING delegate which is
  // required for knowledge / memory retrieval.  Remote model-provider plugins
  // do NOT supply this delegate, so local-embedding must always stay loaded.
  // (Previously it was stripped when a remote provider was detected, but that
  // left TEXT_EMBEDDING unhandled — see #10.)

  // ElizaCloud plugin — load when cloud is enabled OR an API key exists
  // (the key proves the user logged in; the enabled flag may have been
  // accidentally reset by a provider switch or config merge).
  if (config.cloud?.enabled || config.cloud?.apiKey) {
    pluginsToLoad.add("@elizaos/plugin-elizacloud");
  }

  // Optional feature plugins from config.plugins.entries
  const pluginsConfig = config.plugins as
    | Record<string, Record<string, unknown>>
    | undefined;
  if (pluginsConfig?.entries) {
    for (const [key, entry] of Object.entries(pluginsConfig.entries)) {
      if (
        entry &&
        typeof entry === "object" &&
        (entry as Record<string, unknown>).enabled !== false
      ) {
        const pluginName = OPTIONAL_PLUGIN_MAP[key];
        if (pluginName) {
          pluginsToLoad.add(pluginName);
        }
      }
    }
  }

  // Feature flags (config.features)
  const features = config.features;
  if (features && typeof features === "object") {
    for (const [featureName, featureValue] of Object.entries(features)) {
      const isEnabled =
        featureValue === true ||
        (typeof featureValue === "object" &&
          featureValue !== null &&
          (featureValue as Record<string, unknown>).enabled !== false);
      if (isEnabled) {
        const pluginName = OPTIONAL_PLUGIN_MAP[featureName];
        if (pluginName) {
          pluginsToLoad.add(pluginName);
        }
      }
    }
  }

  // x402 plugin — auto-load when config section enabled
  if (config.x402?.enabled) {
    pluginsToLoad.add("@elizaos/plugin-x402");
  }

  // User-installed plugins from config.plugins.installs
  // These are plugins that were installed via the plugin-manager at runtime
  // and tracked in milaidy.json so they persist across restarts.
  const installs = config.plugins?.installs;
  if (installs && typeof installs === "object") {
    for (const [packageName, record] of Object.entries(installs)) {
      if (record && typeof record === "object") {
        pluginsToLoad.add(packageName);
      }
    }
  }

  return pluginsToLoad;
}

// ---------------------------------------------------------------------------
// Custom / drop-in plugin discovery
// ---------------------------------------------------------------------------

/** Subdirectory under the Milaidy state dir for drop-in custom plugins. */
export const CUSTOM_PLUGINS_DIRNAME = "plugins/custom";

/**
 * Scan a directory for drop-in plugin packages. Each immediate subdirectory
 * is treated as a plugin; name comes from package.json or the directory name.
 */
export async function scanDropInPlugins(
  dir: string,
): Promise<Record<string, PluginInstallRecord>> {
  const records: Record<string, PluginInstallRecord> = {};

  let entries: Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return records;
    }
    throw err;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const pluginDir = path.join(dir, entry.name);
    let pluginName = entry.name;
    let version = "0.0.0";

    try {
      const raw = await fs.readFile(
        path.join(pluginDir, "package.json"),
        "utf-8",
      );
      const pkg = JSON.parse(raw) as { name?: string; version?: string };
      if (typeof pkg.name === "string" && pkg.name.trim())
        pluginName = pkg.name.trim();
      if (typeof pkg.version === "string" && pkg.version.trim())
        version = pkg.version.trim();
    } catch (err) {
      if (
        (err as NodeJS.ErrnoException).code !== "ENOENT" &&
        !(err instanceof SyntaxError)
      ) {
        throw err;
      }
    }

    records[pluginName] = { source: "path", installPath: pluginDir, version };
  }

  return records;
}

/**
 * Merge drop-in plugins into the load set. Filters out denied, core-colliding,
 * and already-installed names. Mutates `pluginsToLoad` and `installRecords`.
 */
export function mergeDropInPlugins(params: {
  dropInRecords: Record<string, PluginInstallRecord>;
  installRecords: Record<string, PluginInstallRecord>;
  corePluginNames: ReadonlySet<string>;
  denyList: ReadonlySet<string>;
  pluginsToLoad: Set<string>;
}): { accepted: string[]; skipped: string[] } {
  const {
    dropInRecords,
    installRecords,
    corePluginNames,
    denyList,
    pluginsToLoad,
  } = params;
  const accepted: string[] = [];
  const skipped: string[] = [];

  for (const [name, record] of Object.entries(dropInRecords)) {
    if (denyList.has(name) || installRecords[name]) continue;
    if (corePluginNames.has(name)) {
      skipped.push(
        `[milaidy] Custom plugin "${name}" collides with core plugin — skipping`,
      );
      continue;
    }
    pluginsToLoad.add(name);
    installRecords[name] = record;
    accepted.push(name);
  }

  return { accepted, skipped };
}

// ---------------------------------------------------------------------------
// Browser server pre-flight
// ---------------------------------------------------------------------------

/**
 * The `@elizaos/plugin-browser` npm package expects a `dist/server/` directory
 * containing the compiled stagehand-server, but the npm publish doesn't include
 * it.  The actual source/build lives in the workspace at
 * `plugins/plugin-browser/stagehand-server/`.
 *
 * This function checks whether the server is reachable from the installed
 * package and, if not, creates a symlink so the plugin's process-manager can
 * find it.  Returns `true` when the server index.js is available (or was made
 * available via symlink), `false` otherwise.
 */
export function ensureBrowserServerLink(): boolean {
  try {
    // Resolve the plugin-browser package root via its package.json.
    const req = createRequire(import.meta.url);
    const pkgJsonPath = req.resolve("@elizaos/plugin-browser/package.json");
    const pluginRoot = path.dirname(pkgJsonPath);
    const serverDir = path.join(pluginRoot, "dist", "server");
    const serverIndex = path.join(serverDir, "dist", "index.js");

    // Already linked / available — nothing to do.
    if (existsSync(serverIndex)) return true;

    // Walk upward from this file to find the eliza-workspace root.
    // Layout: <workspace>/milaidy/src/runtime/eliza.ts
    const thisDir = path.dirname(fileURLToPath(import.meta.url));
    const milaidyRoot = path.resolve(thisDir, "..", "..");
    const workspaceRoot = path.resolve(milaidyRoot, "..");
    const stagehandDir = path.join(
      workspaceRoot,
      "plugins",
      "plugin-browser",
      "stagehand-server",
    );
    const stagehandIndex = path.join(stagehandDir, "dist", "index.js");

    if (!existsSync(stagehandIndex)) {
      logger.info(
        `[milaidy] Browser server not found at ${stagehandDir} — ` +
          `@elizaos/plugin-browser will not be loaded`,
      );
      return false;
    }

    // Create symlink: dist/server -> stagehand-server
    symlinkSync(stagehandDir, serverDir, "dir");
    logger.info(
      `[milaidy] Linked browser server: ${serverDir} -> ${stagehandDir}`,
    );
    return true;
  } catch (err) {
    logger.debug(
      `[milaidy] Could not link browser server: ${formatError(err)}`,
    );
    return false;
  }
}

// ---------------------------------------------------------------------------
// Plugin resolution
// ---------------------------------------------------------------------------

/**
 * Resolve Milaidy plugins from config and auto-enable logic.
 * Returns an array of ElizaOS Plugin instances ready for AgentRuntime.
 *
 * Handles three categories of plugins:
 * 1. Built-in/npm plugins — imported by package name
 * 2. User-installed plugins — from ~/.milaidy/plugins/installed/
 * 3. Custom/drop-in plugins — from ~/.milaidy/plugins/custom/ and plugins.load.paths
 *
 * Each plugin is loaded inside an error boundary so a single failing plugin
 * cannot crash the entire agent startup.
 */
export async function resolvePlugins(
  config: MilaidyConfig,
  opts?: { quiet?: boolean },
): Promise<ResolvedPlugin[]> {
  const plugins: ResolvedPlugin[] = [];
  const failedPlugins: Array<{ name: string; error: string }> = [];

  applyPluginAutoEnable({
    config,
    env: process.env,
  } satisfies ApplyPluginAutoEnableParams);

  const pluginsToLoad = collectPluginNames(config);
  const corePluginSet = new Set<string>(CORE_PLUGINS);

  // Build a mutable map of install records so we can merge drop-in discoveries
  const installRecords: Record<string, PluginInstallRecord> = {
    ...(config.plugins?.installs ?? {}),
  };

  // ── Auto-discover drop-in custom plugins ────────────────────────────────
  // Scan well-known dir + any extra dirs from plugins.load.paths (first wins).
  const scanDirs = [
    path.join(resolveStateDir(), CUSTOM_PLUGINS_DIRNAME),
    ...(config.plugins?.load?.paths ?? []).map(resolveUserPath),
  ];
  const dropInRecords: Record<string, PluginInstallRecord> = {};
  for (const dir of scanDirs) {
    for (const [name, record] of Object.entries(await scanDropInPlugins(dir))) {
      if (!dropInRecords[name]) dropInRecords[name] = record;
    }
  }

  // Merge into load set — deny list and core collisions are filtered out.
  const { accepted: customPluginNames, skipped } = mergeDropInPlugins({
    dropInRecords,
    installRecords,
    corePluginNames: corePluginSet,
    denyList: new Set(config.plugins?.deny ?? []),
    pluginsToLoad,
  });

  for (const msg of skipped) logger.warn(msg);
  if (customPluginNames.length > 0) {
    logger.info(
      `[milaidy] Discovered ${customPluginNames.length} custom plugin(s): ${customPluginNames.join(", ")}`,
    );
  }

  logger.info(`[milaidy] Resolving ${pluginsToLoad.size} plugins...`);

  // Dynamically import each plugin inside an error boundary
  for (const pluginName of pluginsToLoad) {
    const isCore = corePluginSet.has(pluginName);
    const installRecord = installRecords[pluginName];

    // Pre-flight: ensure native dependencies are available for special plugins.
    if (pluginName === "@elizaos/plugin-browser") {
      if (!ensureBrowserServerLink()) {
        failedPlugins.push({
          name: pluginName,
          error: "browser server binary not found",
        });
        logger.warn(
          `[milaidy] Skipping ${pluginName}: browser server not available. ` +
            `Build the stagehand-server or remove the plugin from plugins.allow.`,
        );
        continue;
      }
    }

    try {
      let mod: PluginModuleShape;

      if (installRecord?.installPath) {
        // User-installed plugin — load from its install directory on disk.
        // This works cross-platform including .app bundles where we can't
        // modify the app's node_modules.
        mod = await importFromPath(installRecord.installPath, pluginName);
      } else {
        // Built-in/npm plugin — import by package name from node_modules.
        mod = (await import(pluginName)) as PluginModuleShape;
      }

      const pluginInstance = extractPlugin(mod);

      if (pluginInstance) {
        // Wrap the plugin's init function with an error boundary so a
        // crashing plugin.init() does not take down the entire agent.
        const wrappedPlugin = wrapPluginWithErrorBoundary(
          pluginName,
          pluginInstance,
        );
        plugins.push({ name: pluginName, plugin: wrappedPlugin });
        logger.debug(`[milaidy] ✓ Loaded plugin: ${pluginName}`);
      } else {
        const msg = `[milaidy] Plugin ${pluginName} did not export a valid Plugin object`;
        failedPlugins.push({
          name: pluginName,
          error: "no valid Plugin export",
        });
        if (isCore) {
          logger.error(msg);
        } else {
          logger.warn(msg);
        }
      }
    } catch (err) {
      // Core plugins log at error level (visible even with LOG_LEVEL=error).
      // Optional/channel plugins log at warn level so they don't spam in dev.
      const msg = formatError(err);
      failedPlugins.push({ name: pluginName, error: msg });
      if (isCore) {
        logger.error(
          `[milaidy] Failed to load core plugin ${pluginName}: ${msg}`,
        );
      } else {
        logger.warn(`[milaidy] Could not load plugin ${pluginName}: ${msg}`);
      }
    }
  }

  // Summary logging
  logger.info(
    `[milaidy] Plugin resolution complete: ${plugins.length}/${pluginsToLoad.size} loaded` +
      (failedPlugins.length > 0 ? `, ${failedPlugins.length} failed` : ""),
  );
  if (failedPlugins.length > 0) {
    logger.debug(
      `[milaidy] Failed plugins: ${failedPlugins.map((f) => `${f.name} (${f.error})`).join(", ")}`,
    );
  }

  // Diagnose version-skew issues when AI providers failed to load (#10)
  const loadedNames = plugins.map((p) => p.name);
  const diagnostic = diagnoseNoAIProvider(loadedNames, failedPlugins);
  if (diagnostic) {
    if (opts?.quiet) {
      // In headless/GUI mode before onboarding, this is expected — the user
      // will configure a provider through the onboarding wizard and restart.
      logger.info(`[milaidy] ${diagnostic}`);
    } else {
      logger.error(`[milaidy] ${diagnostic}`);
    }
  }

  return plugins;
}

/**
 * Wrap a plugin's `init` and `providers` with error boundaries so that a
 * crash in any single plugin does not take down the entire agent or GUI.
 *
 * NOTE: Actions are NOT wrapped here because ElizaOS's action dispatch
 * already has its own error boundary.  Only `init` (startup) and
 * `providers` (called every turn) need protection at this layer.
 *
 * The wrapper catches errors, logs them with the plugin name for easy
 * debugging, and continues execution.
 */
export function wrapPluginWithErrorBoundary(
  pluginName: string,
  plugin: Plugin,
): Plugin {
  const wrapped: Plugin = { ...plugin };

  // Wrap init if present
  if (plugin.init) {
    const originalInit = plugin.init;
    wrapped.init = async (...args: Parameters<NonNullable<Plugin["init"]>>) => {
      try {
        return await originalInit(...args);
      } catch (err) {
        logger.error(
          `[milaidy] Plugin "${pluginName}" crashed during init: ${formatError(err)}`,
        );
        // Surface the error but don't rethrow — the agent continues
        // without this plugin's init having completed.
        logger.warn(
          `[milaidy] Plugin "${pluginName}" will run in degraded mode (init failed)`,
        );
      }
    };
  }

  // Wrap providers with error boundaries
  if (plugin.providers && plugin.providers.length > 0) {
    wrapped.providers = plugin.providers.map((provider) => ({
      ...provider,
      get: async (...args: Parameters<typeof provider.get>) => {
        try {
          return await provider.get(...args);
        } catch (err) {
          const msg = formatError(err);
          logger.error(
            `[milaidy] Provider "${provider.name}" (plugin: ${pluginName}) crashed: ${msg}`,
          );
          // Return an error marker so downstream consumers can detect
          // the failure rather than silently using empty data.
          return {
            text: `[Provider ${provider.name} error: ${msg}]`,
            data: { _providerError: true },
          };
        }
      },
    }));
  }

  return wrapped;
}

/**
 * Import a plugin module from its install directory on disk.
 *
 * Handles two install layouts:
 *   1. npm layout:  <installPath>/node_modules/@scope/package/  (from `bun add`)
 *   2. git layout:  <installPath>/ is the package root directly  (from `git clone`)
 *
 * @param installPath  Root directory of the installation (e.g. ~/.milaidy/plugins/installed/foo/).
 * @param packageName  The npm package name (e.g. "@elizaos/plugin-discord") — used
 *                     to navigate directly into node_modules when present.
 */
export async function importFromPath(
  installPath: string,
  packageName: string,
): Promise<PluginModuleShape> {
  const absPath = path.resolve(installPath);

  // npm/bun layout:  installPath/node_modules/@scope/name/
  // git layout:      installPath/ is the package itself
  const nmCandidate = path.join(
    absPath,
    "node_modules",
    ...packageName.split("/"),
  );
  let pkgRoot = absPath;
  try {
    if ((await fs.stat(nmCandidate)).isDirectory()) pkgRoot = nmCandidate;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      throw err;
    }
    /* git layout — pkgRoot stays as absPath */
  }

  // Resolve entry point from package.json
  const entryPoint = await resolvePackageEntry(pkgRoot);
  return (await import(pathToFileURL(entryPoint).href)) as PluginModuleShape;
}

/** Read package.json exports/main to find the importable entry file. */
/** @internal Exported for testing. */
export async function resolvePackageEntry(pkgRoot: string): Promise<string> {
  const fallback = path.join(pkgRoot, "dist", "index.js");
  try {
    const raw = await fs.readFile(path.join(pkgRoot, "package.json"), "utf-8");
    const pkg = JSON.parse(raw) as {
      name?: string;
      main?: string;
      exports?: Record<string, string | Record<string, string>> | string;
    };

    if (typeof pkg.exports === "object" && pkg.exports["."] !== undefined) {
      const dot = pkg.exports["."];
      const resolved =
        typeof dot === "string" ? dot : dot.import || dot.default;
      if (typeof resolved === "string") return path.resolve(pkgRoot, resolved);
    }
    if (typeof pkg.exports === "string")
      return path.resolve(pkgRoot, pkg.exports);
    if (pkg.main) return path.resolve(pkgRoot, pkg.main);
    return fallback;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return fallback;
    }
    throw err;
  }
}
