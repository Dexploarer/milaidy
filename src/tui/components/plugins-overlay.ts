import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AgentRuntime } from "@elizaos/core";
import {
  type Component,
  type Focusable,
  getEditorKeybindings,
} from "@mariozechner/pi-tui";
import { loadMiladyConfig, saveMiladyConfig } from "../../config/config.js";
import { installPlugin } from "../../services/plugin-installer.js";
import {
  addRegistryEndpoint,
  getConfiguredEndpoints,
  getRegistryPlugins,
  isDefaultEndpoint,
  removeRegistryEndpoint,
  toggleRegistryEndpoint,
} from "../../services/registry-client.js";
import { tuiTheme } from "../theme.js";
import { ModalFrame } from "./modal-frame.js";
import { PluginEndpointsTab } from "./plugins-endpoints-tab.js";
import {
  InstalledPluginsTab,
  type PluginListItem,
} from "./plugins-installed-tab.js";
import { PluginStoreTab, type StorePluginItem } from "./plugins-store-tab.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PluginsOverlayOptions {
  runtime: AgentRuntime;
  /** Optional API base URL for remote plugin management (e.g. http://127.0.0.1:31337). */
  apiBaseUrl?: string;
  onClose: () => void;
  requestRender: () => void;
}

const TAB_NAMES = ["Installed", "Store", "Endpoints"] as const;
type TabIndex = 0 | 1 | 2;

type PluginCatalogParam = {
  sensitive?: boolean;
  required?: boolean;
  description?: string;
  type?: string;
  default?: string;
};

type PluginCatalogEntry = {
  id: string;
  npmName?: string;
  description?: string;
  configKeys?: string[];
  pluginParameters?: Record<string, PluginCatalogParam>;
  configUiHints?: Record<
    string,
    {
      label?: string;
    }
  >;
};

type InstalledPluginMetadata = {
  configKeys: string[];
  pluginParameters: Record<string, PluginCatalogParam>;
  configUiHints: Record<string, { label?: string }>;
};

type ApiPluginParameter = {
  key: string;
  required?: boolean;
  sensitive?: boolean;
  currentValue?: string | null;
  isSet?: boolean;
};

type ApiPluginEntry = {
  id: string;
  name: string;
  description?: string;
  enabled?: boolean;
  category?: string;
  version?: string;
  npmName?: string;
  parameters?: ApiPluginParameter[];
  configUiHints?: Record<string, { label?: string; options?: unknown[] }>;
};

type ApiInstalledPluginInfo = {
  name?: string;
  version?: string;
};

const API_MASKED_SENTINEL = "__MILADY_API_MASKED__";

let pluginCatalogCache: Map<string, PluginCatalogEntry> | null = null;

function inferSensitiveKey(key: string): boolean {
  const upper = key.toUpperCase();
  return (
    upper.includes("_API_KEY") ||
    upper.includes("_SECRET") ||
    upper.includes("_TOKEN") ||
    upper.includes("_PASSWORD") ||
    upper.includes("_PRIVATE_KEY") ||
    upper.includes("_SIGNING_") ||
    upper.includes("ENCRYPTION_")
  );
}

function inferRequiredKey(key: string, sensitive: boolean): boolean {
  if (!sensitive) return false;
  const upper = key.toUpperCase();
  return (
    upper.endsWith("_API_KEY") ||
    upper.endsWith("_BOT_TOKEN") ||
    upper.endsWith("_TOKEN") ||
    upper.endsWith("_PRIVATE_KEY")
  );
}

function findPackageRoot(startDir: string): string {
  let dir = startDir;
  for (let i = 0; i < 10; i++) {
    const pkgPath = path.join(dir, "package.json");
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8")) as Record<
          string,
          unknown
        >;
        if (pkg.name === "milady") {
          return dir;
        }
      } catch {
        // keep searching
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return startDir;
}

function buildPluginCatalogIndex(): Map<string, PluginCatalogEntry> {
  if (pluginCatalogCache) return pluginCatalogCache;

  const thisDir =
    import.meta.dirname ?? path.dirname(fileURLToPath(import.meta.url));
  const packageRoot = findPackageRoot(thisDir);
  const manifestPath = path.join(packageRoot, "plugins.json");
  const map = new Map<string, PluginCatalogEntry>();

  if (!fs.existsSync(manifestPath)) {
    pluginCatalogCache = map;
    return map;
  }

  try {
    const data = JSON.parse(fs.readFileSync(manifestPath, "utf-8")) as {
      plugins?: PluginCatalogEntry[];
    };

    for (const entry of data.plugins ?? []) {
      map.set(entry.id, entry);
      if (entry.npmName) {
        map.set(entry.npmName, entry);
      }
      if (entry.id.startsWith("plugin-")) {
        map.set(`@elizaos/${entry.id}`, entry);
      } else {
        map.set(`plugin-${entry.id}`, entry);
        map.set(`@elizaos/plugin-${entry.id}`, entry);
      }
    }
  } catch {
    // Best effort — empty map fallback
  }

  pluginCatalogCache = map;
  return map;
}

function readInstalledPluginMetadata(
  packageName: string,
  installPath?: string,
): InstalledPluginMetadata {
  if (!installPath) {
    return { configKeys: [], pluginParameters: {}, configUiHints: {} };
  }

  const pkgJsonCandidates = [
    path.join(
      installPath,
      "node_modules",
      ...packageName.split("/"),
      "package.json",
    ),
    path.join(installPath, "package.json"),
  ];

  for (const pkgPath of pkgJsonCandidates) {
    if (!fs.existsSync(pkgPath)) {
      continue;
    }

    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8")) as {
        pluginParameters?: Record<string, PluginCatalogParam>;
        configUiHints?: Record<string, { label?: string }>;
        elizaos?: {
          configKeys?: string[];
          configUiHints?: Record<string, { label?: string }>;
          pluginParameters?: Record<string, PluginCatalogParam>;
        };
        agentConfig?: {
          pluginParameters?: Record<string, PluginCatalogParam>;
        };
      };

      const pluginParameters =
        pkg.pluginParameters ??
        pkg.elizaos?.pluginParameters ??
        pkg.agentConfig?.pluginParameters ??
        {};
      const configUiHints =
        pkg.configUiHints ?? pkg.elizaos?.configUiHints ?? {};
      const configKeys = Array.from(
        new Set([
          ...(pkg.elizaos?.configKeys ?? []),
          ...Object.keys(pluginParameters),
        ]),
      );

      return { configKeys, pluginParameters, configUiHints };
    } catch {
      // Try next candidate
    }
  }

  return { configKeys: [], pluginParameters: {}, configUiHints: {} };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Main Plugins overlay with three tabs: Installed, Store, Endpoints.
 * Accessible via `/plugins` or Ctrl+L.
 */
export class PluginsOverlayComponent implements Component, Focusable {
  focused = false;

  private activeTab: TabIndex = 0;
  private tabs: [InstalledPluginsTab, PluginStoreTab, PluginEndpointsTab];
  private options: PluginsOverlayOptions;
  private apiInstalledPluginNames = new Set<string>();
  private frame = new ModalFrame({
    title: "Plugins",
    hint: "↑↓ navigate • Tab switch tabs • Enter select • Esc close",
  });

  constructor(options: PluginsOverlayOptions) {
    this.options = options;
    const render = () => options.requestRender();

    // --- Installed tab ---
    const installedTab = new InstalledPluginsTab({
      getPlugins: () => this.getInstalledPlugins(),
      onTogglePlugin: async (id, enabled) => {
        await this.togglePluginEnabled(id, enabled);
      },
      onConfigSave: async (id, config) => {
        await this.savePluginConfig(id, config);
      },
      onClose: () => options.onClose(),
      requestRender: render,
    });

    // --- Store tab ---
    const storeTab = new PluginStoreTab({
      searchPlugins: async (query, limit) => this.searchStore(query, limit),
      getRegistryPlugins: async () => this.getStorePlugins(),
      installPlugin: async (name) => {
        const apiBaseUrl = this.getApiBaseUrl();
        if (apiBaseUrl) {
          return this.installPluginViaApi(apiBaseUrl, name);
        }

        const result = await installPlugin(name);
        if (!result.success) {
          return {
            success: false,
            message: result.error ?? `Failed to install ${name}`,
          };
        }

        const restartHint = result.requiresRestart
          ? " Restart milady to load it."
          : "";
        return {
          success: true,
          message: `${result.pluginName}@${result.version} installed.${restartHint}`,
        };
      },
      isInstalled: (name) => this.isPluginInstalled(name),
      onClose: () => options.onClose(),
      requestRender: render,
    });

    // --- Endpoints tab ---
    const endpointsTab = new PluginEndpointsTab({
      getEndpoints: () => getConfiguredEndpoints(),
      addEndpoint: (label, url) => addRegistryEndpoint(label, url),
      removeEndpoint: (url) => removeRegistryEndpoint(url),
      toggleEndpoint: (url, enabled) => toggleRegistryEndpoint(url, enabled),
      isDefaultEndpoint: (url) => isDefaultEndpoint(url),
      onClose: () => options.onClose(),
      requestRender: render,
    });

    this.tabs = [installedTab, storeTab, endpointsTab];
  }

  // ── Data bridge helpers ─────────────────────────────────────────────

  private getApiBaseUrl(): string | null {
    const base =
      this.options.apiBaseUrl?.trim() ||
      process.env.MILADY_API_BASE_URL?.trim() ||
      process.env.MILADY_API_BASE?.trim();
    if (!base) return null;
    return base.replace(/\/+$/, "");
  }

  private getApiToken(): string | null {
    const token = process.env.MILADY_API_TOKEN?.trim();
    return token ? token : null;
  }

  private async apiFetchJson<T>(
    apiBaseUrl: string,
    path: string,
    init?: RequestInit,
  ): Promise<T> {
    const headers = new Headers(init?.headers);
    if (init?.body != null && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    const token = this.getApiToken();
    if (token && !headers.has("Authorization")) {
      headers.set("Authorization", `Bearer ${token}`);
    }

    const res = await fetch(`${apiBaseUrl}${path}`, {
      ...init,
      headers,
    });

    if (!res.ok) {
      let message = `HTTP ${res.status}`;
      try {
        const body = (await res.json()) as {
          error?: string;
          validationErrors?: Array<{ field?: string; message?: string }>;
        };
        if (typeof body.error === "string" && body.error.trim()) {
          message = body.error;
        } else if (Array.isArray(body.validationErrors)) {
          const first = body.validationErrors[0];
          if (first?.message) message = first.message;
        }
      } catch {
        // keep default message
      }
      throw new Error(message);
    }

    return res.json() as Promise<T>;
  }

  private async getInstalledPlugins(): Promise<PluginListItem[]> {
    const apiBaseUrl = this.getApiBaseUrl();
    if (apiBaseUrl) {
      try {
        return await this.getInstalledPluginsFromApi(apiBaseUrl);
      } catch {
        // Fall back to local config if API lookup fails.
      }
    }

    return this.getInstalledPluginsFromConfig();
  }

  private registerInstalledPluginName(name: string): void {
    const trimmed = name.trim();
    if (!trimmed) return;

    this.apiInstalledPluginNames.add(trimmed);

    const normalized = trimmed
      .replace(/^@[^/]+\//, "")
      .replace(/^plugin-/, "")
      .trim();

    if (!normalized) return;

    this.apiInstalledPluginNames.add(normalized);
    this.apiInstalledPluginNames.add(`plugin-${normalized}`);
    this.apiInstalledPluginNames.add(`@elizaos/plugin-${normalized}`);
  }

  private async loadApiInstalledPlugins(
    apiBaseUrl: string,
  ): Promise<ApiInstalledPluginInfo[]> {
    try {
      const response = await this.apiFetchJson<{
        plugins?: ApiInstalledPluginInfo[];
      }>(apiBaseUrl, "/api/plugins/installed");
      const plugins = response.plugins ?? [];

      this.apiInstalledPluginNames.clear();
      for (const plugin of plugins) {
        if (plugin.name) this.registerInstalledPluginName(plugin.name);
      }

      return plugins;
    } catch {
      return [];
    }
  }

  private async getInstalledPluginsFromApi(
    apiBaseUrl: string,
  ): Promise<PluginListItem[]> {
    const installed = await this.loadApiInstalledPlugins(apiBaseUrl);

    let response: { plugins: ApiPluginEntry[] };
    try {
      response = await this.apiFetchJson<{ plugins: ApiPluginEntry[] }>(
        apiBaseUrl,
        "/api/plugins",
      );
    } catch (err) {
      if (installed.length === 0) throw err;
      const fallbackItems: PluginListItem[] = [];
      for (const plugin of installed) {
        const name = plugin.name?.trim();
        if (!name) continue;
        const id = name.replace(/^@[^/]+\//, "").replace(/^plugin-/, "");
        fallbackItems.push({
          id: id || name,
          name,
          description: "",
          enabled: true,
          category: "plugin",
          version: plugin.version ?? "unknown",
          configStatus: { set: 0, total: 0 },
          parameters: [],
        });
      }
      return fallbackItems;
    }

    const plugins = response.plugins ?? [];
    const matchedInstalled = new Set<string>();

    const isNameMatched = (
      candidates: Set<string>,
      installedName: string,
    ): boolean => {
      if (candidates.has(installedName)) return true;
      const normalized = installedName
        .replace(/^@[^/]+\//, "")
        .replace(/^plugin-/, "")
        .trim();
      return normalized.length > 0 && candidates.has(normalized);
    };

    const items = plugins.map((plugin) => {
      const pluginId = plugin.id?.trim() || plugin.name?.trim() || "plugin";
      const npmName = plugin.npmName?.trim();
      if (npmName) this.registerInstalledPluginName(npmName);
      if (pluginId) this.registerInstalledPluginName(pluginId);

      const candidates = new Set<string>();
      if (pluginId) {
        candidates.add(pluginId);
        candidates.add(`plugin-${pluginId}`);
        candidates.add(`@elizaos/plugin-${pluginId}`);
      }
      if (npmName) {
        candidates.add(npmName);
      }

      let installedVersion: string | undefined;
      for (const entry of installed) {
        const installedName = entry.name?.trim();
        if (!installedName) continue;
        if (!isNameMatched(candidates, installedName)) continue;
        matchedInstalled.add(installedName);
        installedVersion = entry.version ?? installedVersion;
      }

      const parameters = (plugin.parameters ?? []).map((param) => {
        const key = param.key;
        const hint = plugin.configUiHints?.[key];
        const options = Array.isArray(hint?.options)
          ? hint.options
              .map((opt) => {
                if (typeof opt === "string") return opt;
                if (typeof opt === "object" && opt !== null) {
                  const value = (opt as { value?: unknown }).value;
                  if (typeof value === "string") return value;
                }
                return null;
              })
              .filter((v): v is string => typeof v === "string")
          : undefined;

        return {
          key,
          label:
            typeof hint?.label === "string" && hint.label.trim()
              ? hint.label
              : key,
          value:
            param.sensitive && param.isSet
              ? API_MASKED_SENTINEL
              : (param.currentValue ?? ""),
          required: param.required,
          sensitive: param.sensitive,
          values: options,
        };
      });

      return {
        id: pluginId,
        name: plugin.name || pluginId,
        description: plugin.description ?? "",
        enabled: plugin.enabled !== false,
        category: plugin.category ?? "plugin",
        version: plugin.version ?? installedVersion ?? "unknown",
        configStatus: {
          set: (plugin.parameters ?? []).filter((p) => p.isSet).length,
          total: (plugin.parameters ?? []).length,
        },
        parameters,
      };
    });

    for (const entry of installed) {
      const installedName = entry.name?.trim();
      if (!installedName || matchedInstalled.has(installedName)) continue;
      const id = installedName
        .replace(/^@[^/]+\//, "")
        .replace(/^plugin-/, "")
        .trim();
      items.push({
        id: id || installedName,
        name: installedName,
        description: "",
        enabled: true,
        category: "plugin",
        version: entry.version ?? "unknown",
        configStatus: { set: 0, total: 0 },
        parameters: [],
      });
    }

    return items;
  }

  private async getInstalledPluginsFromConfig(): Promise<PluginListItem[]> {
    const cfg = loadMiladyConfig();
    const entries = cfg.plugins?.entries ?? {};
    const installs = cfg.plugins?.installs ?? {};
    const catalog = buildPluginCatalogIndex();
    const plugins: PluginListItem[] = [];

    // Combine config entries with install records
    const allIds = new Set([...Object.keys(entries), ...Object.keys(installs)]);

    for (const id of allIds) {
      const entry = entries[id];
      const install = installs[id];
      const config = (entry?.config ?? {}) as Record<string, unknown>;
      const catalogEntry = catalog.get(id);
      const installedMeta = readInstalledPluginMetadata(
        id,
        install?.installPath,
      );

      const mergedParamDefs: Record<string, PluginCatalogParam> = {
        ...(catalogEntry?.pluginParameters ?? {}),
        ...installedMeta.pluginParameters,
      };
      const mergedHints: Record<string, { label?: string }> = {
        ...(catalogEntry?.configUiHints ?? {}),
        ...installedMeta.configUiHints,
      };

      const declaredKeys = [
        ...(catalogEntry?.configKeys ?? []),
        ...installedMeta.configKeys,
        ...Object.keys(mergedParamDefs),
      ];
      const keySet = new Set([...declaredKeys, ...Object.keys(config)]);
      const keys = Array.from(keySet).sort((a, b) => a.localeCompare(b));

      const parameters = keys.map((key) => {
        const valueFromConfig = config[key];
        const value =
          valueFromConfig != null && valueFromConfig !== ""
            ? String(valueFromConfig)
            : (process.env[key] ?? "");
        const hint = mergedHints[key];
        const paramDef = mergedParamDefs[key];
        const sensitive =
          typeof paramDef?.sensitive === "boolean"
            ? paramDef.sensitive
            : inferSensitiveKey(key);
        const required =
          typeof paramDef?.required === "boolean"
            ? paramDef.required
            : inferRequiredKey(key, sensitive);

        return {
          key,
          label: hint?.label ?? key,
          value,
          required,
          sensitive,
        };
      });

      plugins.push({
        id,
        name: id,
        description: install?.spec ?? catalogEntry?.description ?? "",
        enabled: entry?.enabled !== false,
        category: id.includes("plugin-") ? "plugin" : "extension",
        version: install?.version ?? "unknown",
        configStatus: {
          set: parameters.filter((p) => p.value.trim() !== "").length,
          total: parameters.length,
        },
        parameters,
      });
    }

    return plugins;
  }

  private async togglePluginEnabled(
    id: string,
    enabled: boolean,
  ): Promise<void> {
    const apiBaseUrl = this.getApiBaseUrl();
    if (apiBaseUrl) {
      await this.apiFetchJson<{ ok: boolean }>(
        apiBaseUrl,
        `/api/plugins/${encodeURIComponent(id)}`,
        {
          method: "PUT",
          body: JSON.stringify({ enabled }),
        },
      );
      return;
    }

    const cfg = loadMiladyConfig();
    if (!cfg.plugins) cfg.plugins = {};
    if (!cfg.plugins.entries) cfg.plugins.entries = {};
    if (!cfg.plugins.entries[id]) cfg.plugins.entries[id] = {};
    cfg.plugins.entries[id].enabled = enabled;
    saveMiladyConfig(cfg);
  }

  private async savePluginConfig(
    id: string,
    config: Record<string, string>,
  ): Promise<void> {
    const apiBaseUrl = this.getApiBaseUrl();
    if (apiBaseUrl) {
      const filteredConfig = Object.fromEntries(
        Object.entries(config).filter(
          ([, value]) => value !== API_MASKED_SENTINEL,
        ),
      );
      await this.apiFetchJson<{ ok: boolean }>(
        apiBaseUrl,
        `/api/plugins/${encodeURIComponent(id)}`,
        {
          method: "PUT",
          body: JSON.stringify({ config: filteredConfig }),
        },
      );
      return;
    }

    const cfg = loadMiladyConfig();
    if (!cfg.plugins) cfg.plugins = {};
    if (!cfg.plugins.entries) cfg.plugins.entries = {};
    if (!cfg.plugins.entries[id]) cfg.plugins.entries[id] = {};
    cfg.plugins.entries[id].config = config;
    saveMiladyConfig(cfg);
  }

  private async installPluginViaApi(
    apiBaseUrl: string,
    name: string,
  ): Promise<{ success: boolean; message: string }> {
    const response = await this.apiFetchJson<{
      ok?: boolean;
      message?: string;
      error?: string;
      plugin?: { name?: string; version?: string };
      requiresRestart?: boolean;
    }>(apiBaseUrl, "/api/plugins/install", {
      method: "POST",
      body: JSON.stringify({ name }),
    });

    if (!response.ok) {
      return {
        success: false,
        message: response.error ?? `Failed to install ${name}`,
      };
    }

    const pluginName = response.plugin?.name ?? name;
    const version = response.plugin?.version;
    const restartHint = response.requiresRestart
      ? " Restart milady to load it."
      : "";

    return {
      success: true,
      message:
        response.message ??
        `${pluginName}${version ? `@${version}` : ""} installed.${restartHint}`,
    };
  }

  private async getStorePlugins(): Promise<StorePluginItem[]> {
    const apiBaseUrl = this.getApiBaseUrl();
    if (apiBaseUrl) {
      await this.loadApiInstalledPlugins(apiBaseUrl);
    }

    const registry = await getRegistryPlugins();
    const cfg = loadMiladyConfig();
    const installs = cfg.plugins?.installs ?? {};

    const items: StorePluginItem[] = [];
    for (const [, p] of registry) {
      if (p.kind === "app") continue; // Skip apps
      items.push({
        name: p.name,
        description: p.description,
        latestVersion: p.npm.v2Version || p.npm.v1Version || p.npm.v0Version,
        stars: p.stars,
        supports: p.supports,
        installed: this.isPluginInstalled(p.name) || p.name in installs,
      });
    }

    // Sort by stars descending
    items.sort((a, b) => b.stars - a.stars);
    return items;
  }

  private async searchStore(
    query: string,
    limit = 15,
  ): Promise<StorePluginItem[]> {
    const apiBaseUrl = this.getApiBaseUrl();
    if (apiBaseUrl) {
      await this.loadApiInstalledPlugins(apiBaseUrl);
    }

    // Use searchNonAppPlugins to exclude app entries from store results.
    const { searchNonAppPlugins } = await import(
      "../../services/registry-client.js"
    );
    const results = await searchNonAppPlugins(query, limit);
    const cfg = loadMiladyConfig();
    const installs = cfg.plugins?.installs ?? {};

    return results.map((r) => ({
      name: r.name,
      description: r.description,
      latestVersion: r.latestVersion,
      stars: r.stars,
      supports: r.supports,
      installed: this.isPluginInstalled(r.name) || r.name in installs,
    }));
  }

  private isPluginInstalled(name: string): boolean {
    if (this.apiInstalledPluginNames.has(name)) {
      return true;
    }

    const normalized = name.replace(/^@[^/]+\//, "").replace(/^plugin-/, "");
    if (normalized && this.apiInstalledPluginNames.has(normalized)) {
      return true;
    }

    try {
      const cfg = loadMiladyConfig();
      const installs = cfg.plugins?.installs ?? {};
      return name in installs;
    } catch {
      return false;
    }
  }

  // ── Tab management ─────────────────────────────────────────────────

  private switchTab(index: TabIndex): void {
    this.activeTab = index;
    this.options.requestRender();
  }

  handleInput(data: string): void {
    const kb = getEditorKeybindings();
    const tab = this.tabs[this.activeTab];
    tab.focused = this.focused;

    // When the active tab is capturing input (e.g. add-endpoint flow),
    // delegate ALL keys to the tab — don't intercept Esc, digits, or Tab.
    if (tab.isCapturingInput()) {
      tab.handleInput(data);
      return;
    }

    // Esc closes overlay
    if (kb.matches(data, "selectCancel")) {
      this.options.onClose();
      return;
    }

    // Tab key switches between tabs
    if (data === "\t") {
      this.switchTab(((this.activeTab + 1) % 3) as TabIndex);
      return;
    }

    // Number keys 1-3 switch tabs directly
    if (data === "1") {
      this.switchTab(0);
      return;
    }
    if (data === "2") {
      this.switchTab(1);
      return;
    }
    if (data === "3") {
      this.switchTab(2);
      return;
    }

    // Delegate to active tab
    tab.handleInput(data);
  }

  render(width: number): string[] {
    const body: string[] = [];

    // Tab bar
    const tabBar = TAB_NAMES.map((name, i) => {
      const isActive = i === this.activeTab;
      const num = `${i + 1}`;
      if (isActive) {
        return tuiTheme.accent(`[${num}:${name}]`);
      }
      return tuiTheme.dim(` ${num}:${name} `);
    }).join("  ");
    body.push(` ${tabBar}`);
    body.push("");

    // Active tab content
    const tab = this.tabs[this.activeTab];
    tab.focused = this.focused;
    body.push(...tab.render(width));

    return this.frame.render(width, body);
  }

  invalidate(): void {
    for (const tab of this.tabs) {
      tab.invalidate();
    }
  }
}
