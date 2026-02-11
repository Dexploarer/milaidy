import fs from "node:fs";
import path from "node:path";
import { type AgentRuntime, logger } from "@elizaos/core";
import type { MilaidyConfig } from "../config/config.js";
import {
  type PluginParamInfo,
  validatePluginConfig,
} from "./plugin-validation.js";
import {
  type PluginEntry,
  type PluginIndex,
  type PluginParamDef,
  type SkillAcknowledgmentMap,
  type SkillEntry,
  type SkillPreferencesMap,
} from "./types.js";
import { maskValue } from "./utils.js";

// ---------------------------------------------------------------------------
// Package root resolution (for reading bundled plugins.json)
// ---------------------------------------------------------------------------

function findOwnPackageRoot(startDir: string): string {
  let dir = startDir;
  for (let i = 0; i < 10; i++) {
    const pkgPath = path.join(dir, "package.json");
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8")) as Record<
          string,
          unknown
        >;
        if (pkg.name === "milaidy") return dir;
      } catch {
        /* keep searching */
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return startDir;
}

// ---------------------------------------------------------------------------
// Plugin discovery
// ---------------------------------------------------------------------------

function buildParamDefs(
  pluginParams: Record<string, Record<string, unknown>>,
): PluginParamDef[] {
  return Object.entries(pluginParams).map(([key, def]) => {
    const envValue = process.env[key];
    const isSet = Boolean(envValue?.trim());
    const sensitive = Boolean(def.sensitive);
    return {
      key,
      type: (def.type as string) ?? "string",
      description: (def.description as string) ?? "",
      required: Boolean(def.required),
      sensitive,
      default: def.default as string | undefined,
      options: Array.isArray(def.options)
        ? (def.options as string[])
        : undefined,
      currentValue: isSet
        ? sensitive
          ? maskValue(envValue ?? "")
          : (envValue ?? "")
        : null,
      isSet,
    };
  });
}

/**
 * Discover user-installed plugins from the Store (not bundled in the manifest).
 * Reads from config.plugins.installs and tries to enrich with package.json metadata.
 */
export function discoverInstalledPlugins(
  config: MilaidyConfig,
  bundledIds: Set<string>,
): PluginEntry[] {
  const installs = config.plugins?.installs;
  if (!installs || typeof installs !== "object") return [];

  const entries: PluginEntry[] = [];

  for (const [packageName, record] of Object.entries(installs)) {
    // Derive a short id from the package name (e.g. "@elizaos/plugin-foo" -> "foo")
    const id = packageName
      .replace(/^@[^/]+\/plugin-/, "")
      .replace(/^@[^/]+\//, "")
      .replace(/^plugin-/, "");

    // Skip if it's already covered by the bundled manifest
    if (bundledIds.has(id)) continue;

    const category = categorizePlugin(id);
    const installPath = (record as Record<string, string>).installPath;

    // Try to read the plugin's package.json for metadata
    let name = packageName;
    let description = `Installed from registry (v${(record as Record<string, string>).version ?? "unknown"})`;

    if (installPath) {
      // Check npm layout first, then direct layout
      const candidates = [
        path.join(
          installPath,
          "node_modules",
          ...packageName.split("/"),
          "package.json",
        ),
        path.join(installPath, "package.json"),
      ];
      for (const pkgPath of candidates) {
        try {
          if (fs.existsSync(pkgPath)) {
            const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8")) as {
              name?: string;
              description?: string;
            };
            if (pkg.name) name = pkg.name;
            if (pkg.description) description = pkg.description;
            break;
          }
        } catch {
          // ignore read errors
        }
      }
    }

    entries.push({
      id,
      name,
      description,
      enabled: false, // Will be updated against the runtime below
      configured: true,
      envKey: null,
      category,
      source: "store",
      configKeys: [],
      parameters: [],
      validationErrors: [],
      validationWarnings: [],
    });
  }

  return entries.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Discover available plugins from the bundled plugins.json manifest.
 * Falls back to filesystem scanning for monorepo development.
 */
export function discoverPluginsFromManifest(): PluginEntry[] {
  const thisDir =
    import.meta.dirname ?? path.dirname(new URL(import.meta.url).pathname);
  const packageRoot = findOwnPackageRoot(thisDir);
  const manifestPath = path.join(packageRoot, "plugins.json");

  if (fs.existsSync(manifestPath)) {
    try {
      const index = JSON.parse(
        fs.readFileSync(manifestPath, "utf-8"),
      ) as PluginIndex;
      // Keys that are auto-injected by infrastructure and should never be
      // exposed as user-facing "config keys" or parameter definitions.
      const HIDDEN_KEYS = new Set(["VERCEL_OIDC_TOKEN"]);
      return index.plugins
        .map((p) => {
          const category = categorizePlugin(p.id);
          const envKey = p.envKey;
          const filteredConfigKeys = p.configKeys.filter(
            (k) => !HIDDEN_KEYS.has(k),
          );
          const configured = envKey
            ? Boolean(process.env[envKey])
            : filteredConfigKeys.length === 0;
          const filteredParams = p.pluginParameters
            ? Object.fromEntries(
                Object.entries(p.pluginParameters).filter(
                  ([k]) => !HIDDEN_KEYS.has(k),
                ),
              )
            : undefined;
          const parameters = filteredParams
            ? buildParamDefs(filteredParams)
            : [];
          const paramInfos: PluginParamInfo[] = parameters.map((pd) => ({
            key: pd.key,
            required: pd.required,
            sensitive: pd.sensitive,
            type: pd.type,
            description: pd.description,
            default: pd.default,
          }));
          const validation = validatePluginConfig(
            p.id,
            category,
            envKey,
            filteredConfigKeys,
            undefined,
            paramInfos,
          );

          return {
            id: p.id,
            name: p.name,
            description: p.description,
            enabled: false,
            configured,
            envKey,
            category,
            source: "bundled" as const,
            configKeys: filteredConfigKeys,
            parameters,
            validationErrors: validation.errors,
            validationWarnings: validation.warnings,
            npmName: p.npmName,
            version: p.version,
            pluginDeps: p.pluginDeps,
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name));
    } catch (err) {
      logger.debug(
        `[milaidy-api] Failed to read plugins.json: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  // Fallback: no manifest found
  logger.debug(
    "[milaidy-api] plugins.json not found — run `npm run generate:plugins`",
  );
  return [];
}

export function categorizePlugin(
  id: string,
): "ai-provider" | "connector" | "database" | "feature" {
  const aiProviders = [
    "openai",
    "anthropic",
    "groq",
    "xai",
    "ollama",
    "openrouter",
    "google-genai",
    "local-ai",
    "vercel-ai-gateway",
    "deepseek",
    "together",
    "mistral",
    "cohere",
    "perplexity",
    "qwen",
    "minimax",
    "zai",
  ];
  const connectors = [
    "telegram",
    "discord",
    "slack",
    "whatsapp",
    "signal",
    "imessage",
    "bluebubbles",
    "farcaster",
    "bluesky",
    "matrix",
    "nostr",
    "msteams",
    "mattermost",
    "google-chat",
    "feishu",
    "line",
    "zalo",
    "zalouser",
    "tlon",
    "twitch",
    "nextcloud-talk",
    "instagram",
  ];
  const databases = ["sql", "localdb", "inmemorydb"];

  if (aiProviders.includes(id)) return "ai-provider";
  if (connectors.includes(id)) return "connector";
  if (databases.includes(id)) return "database";
  return "feature";
}

// ---------------------------------------------------------------------------
// Skills discovery + database-backed preferences
// ---------------------------------------------------------------------------

/** Cache key for persisting skill enable/disable state in the agent database. */
const SKILL_PREFS_CACHE_KEY = "milaidy:skill-preferences";

/**
 * Load persisted skill preferences from the agent's database.
 * Returns an empty map when the runtime or database isn't available.
 */
export async function loadSkillPreferences(
  runtime: AgentRuntime | null,
): Promise<SkillPreferencesMap> {
  if (!runtime) return {};
  try {
    const prefs = await runtime.getCache<SkillPreferencesMap>(
      SKILL_PREFS_CACHE_KEY,
    );
    return prefs ?? {};
  } catch {
    return {};
  }
}

/**
 * Persist skill preferences to the agent's database.
 */
export async function saveSkillPreferences(
  runtime: AgentRuntime,
  prefs: SkillPreferencesMap,
): Promise<void> {
  try {
    await runtime.setCache(SKILL_PREFS_CACHE_KEY, prefs);
  } catch (err) {
    logger.debug(
      `[milaidy-api] Failed to save skill preferences: ${err instanceof Error ? err.message : err}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Skill scan acknowledgments — tracks user review of security findings
// ---------------------------------------------------------------------------

const SKILL_ACK_CACHE_KEY = "milaidy:skill-scan-acknowledgments";

export async function loadSkillAcknowledgments(
  runtime: AgentRuntime | null,
): Promise<SkillAcknowledgmentMap> {
  if (!runtime) return {};
  try {
    const acks =
      await runtime.getCache<SkillAcknowledgmentMap>(SKILL_ACK_CACHE_KEY);
    return acks ?? {};
  } catch {
    return {};
  }
}

export async function saveSkillAcknowledgments(
  runtime: AgentRuntime,
  acks: SkillAcknowledgmentMap,
): Promise<void> {
  try {
    await runtime.setCache(SKILL_ACK_CACHE_KEY, acks);
  } catch (err) {
    logger.debug(
      `[milaidy-api] Failed to save skill acknowledgments: ${err instanceof Error ? err.message : err}`,
    );
  }
}

/**
 * Load a .scan-results.json from the skill's directory on disk.
 *
 * Checks multiple locations because skills can be installed from different sources:
 * - Workspace skills: {workspace}/skills/{id}/
 * - Marketplace skills: {workspace}/skills/.marketplace/{id}/
 * - Catalog-installed (managed) skills: {managed-dir}/{id}/ (default: ./skills/)
 *
 * Also queries the AgentSkillsService for the skill's path when a runtime is available,
 * which covers all sources regardless of directory layout.
 */
export async function loadScanReportFromDisk(
  skillId: string,
  workspaceDir: string,
  runtime?: AgentRuntime | null,
): Promise<Record<string, unknown> | null> {
  const fsSync = await import("node:fs");
  const pathMod = await import("node:path");

  const candidates = [
    pathMod.join(workspaceDir, "skills", skillId, ".scan-results.json"),
    pathMod.join(
      workspaceDir,
      "skills",
      ".marketplace",
      skillId,
      ".scan-results.json",
    ),
  ];

  // Also check the path reported by the AgentSkillsService (covers catalog-installed skills
  // whose managed dir might differ from the workspace dir)
  if (runtime) {
    const svc = runtime.getService("AGENT_SKILLS_SERVICE") as
      | { getLoadedSkills?: () => Array<{ slug: string; path: string }> }
      | undefined;
    if (svc?.getLoadedSkills) {
      const loaded = svc.getLoadedSkills().find((s) => s.slug === skillId);
      if (loaded?.path) {
        candidates.push(pathMod.join(loaded.path, ".scan-results.json"));
      }
    }
  }

  // Deduplicate in case paths overlap
  const seen = new Set<string>();
  for (const candidate of candidates) {
    const resolved = pathMod.resolve(candidate);
    if (seen.has(resolved)) continue;
    seen.add(resolved);

    if (!fsSync.existsSync(resolved)) continue;
    const content = fsSync.readFileSync(resolved, "utf-8");
    const parsed = JSON.parse(content);
    if (
      typeof parsed.scannedAt === "string" &&
      typeof parsed.status === "string" &&
      Array.isArray(parsed.findings) &&
      Array.isArray(parsed.manifestFindings)
    ) {
      return parsed as Record<string, unknown>;
    }
  }

  return null;
}

/**
 * Determine whether a skill should be enabled.
 *
 * Priority (highest first):
 *   1. Database preferences (per-agent, persisted via PUT /api/skills/:id)
 *   2. `skills.denyBundled` config — always blocks
 *   3. `skills.entries[id].enabled` config — per-skill default
 *   4. `skills.allowBundled` config — whitelist mode
 *   5. Default: enabled
 */
function resolveSkillEnabled(
  id: string,
  config: MilaidyConfig,
  dbPrefs: SkillPreferencesMap,
): boolean {
  // Database preference takes priority (explicit user action)
  if (id in dbPrefs) return dbPrefs[id];

  const skillsCfg = config.skills;

  // Deny list always blocks
  if (skillsCfg?.denyBundled?.includes(id)) return false;

  // Per-skill config entry
  const entry = skillsCfg?.entries?.[id];
  if (entry && entry.enabled === false) return false;
  if (entry && entry.enabled === true) return true;

  // Allowlist: if set, only listed skills are enabled
  if (skillsCfg?.allowBundled && skillsCfg.allowBundled.length > 0) {
    return skillsCfg.allowBundled.includes(id);
  }

  return true;
}

/**
 * Discover skills from @elizaos/skills and workspace, applying
 * database preferences and config filtering.
 *
 * When a runtime is available, skills are primarily sourced from the
 * AgentSkillsService (which has already loaded, validated, and
 * precedence-resolved all skills). Filesystem scanning is used as a
 * fallback when the service isn't registered.
 */
export async function discoverSkills(
  workspaceDir: string,
  config: MilaidyConfig,
  runtime: AgentRuntime | null,
): Promise<SkillEntry[]> {
  // Load persisted preferences from the agent database
  const dbPrefs = await loadSkillPreferences(runtime);

  // ── Primary path: pull from AgentSkillsService (most accurate) ──────────
  if (runtime) {
    try {
      const service = runtime.getService("AGENT_SKILLS_SERVICE");
      // eslint-disable-next-line -- runtime service is loosely typed; cast via unknown
      const svc = service as unknown as
        | {
            getLoadedSkills?: () => Array<{
              slug: string;
              name: string;
              description: string;
              source: string;
              path: string;
            }>;
            getSkillScanStatus?: (
              slug: string,
            ) => "clean" | "warning" | "critical" | "blocked" | null;
          }
        | undefined;
      if (svc && typeof svc.getLoadedSkills === "function") {
        const loadedSkills = svc.getLoadedSkills();

        if (loadedSkills.length > 0) {
          const skills: SkillEntry[] = loadedSkills.map((s) => {
            // Get scan status from in-memory map (fast) or from disk report
            let scanStatus: SkillEntry["scanStatus"] = null;
            if (svc.getSkillScanStatus) {
              scanStatus = svc.getSkillScanStatus(s.slug);
            }
            if (!scanStatus) {
              // Check for .scan-results.json on disk
              const reportPath = path.join(s.path, ".scan-results.json");
              if (fs.existsSync(reportPath)) {
                const raw = fs.readFileSync(reportPath, "utf-8");
                const parsed = JSON.parse(raw);
                if (parsed?.status) scanStatus = parsed.status;
              }
            }

            return {
              id: s.slug,
              name: s.name || s.slug,
              description: (s.description || "").slice(0, 200),
              enabled: resolveSkillEnabled(s.slug, config, dbPrefs),
              scanStatus,
            };
          });

          return skills.sort((a, b) => a.name.localeCompare(b.name));
        }
      }
    } catch {
      logger.debug(
        "[milaidy-api] AgentSkillsService not available, falling back to filesystem scan",
      );
    }
  }

  // ── Fallback: filesystem scanning ───────────────────────────────────────
  const skillsDirs: string[] = [];

  // Bundled skills from the @elizaos/skills package
  try {
    const skillsPkg = (await import("@elizaos/skills")) as {
      getSkillsDir: () => string;
    };
    const bundledDir = skillsPkg.getSkillsDir();
    if (bundledDir && fs.existsSync(bundledDir)) {
      skillsDirs.push(bundledDir);
    }
  } catch {
    logger.debug(
      "[milaidy-api] @elizaos/skills not available for skill discovery",
    );
  }

  // Workspace-local skills
  const workspaceSkills = path.join(workspaceDir, "skills");
  if (fs.existsSync(workspaceSkills)) {
    skillsDirs.push(workspaceSkills);
  }

  // Extra dirs from config
  const extraDirs = config.skills?.load?.extraDirs;
  if (extraDirs) {
    for (const dir of extraDirs) {
      if (fs.existsSync(dir)) skillsDirs.push(dir);
    }
  }

  const skills: SkillEntry[] = [];
  const seen = new Set<string>();

  for (const dir of skillsDirs) {
    scanSkillsDir(dir, skills, seen, config, dbPrefs);
  }

  return skills.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Recursively scan a directory for SKILL.md files, applying config filtering.
 */
function scanSkillsDir(
  dir: string,
  skills: SkillEntry[],
  seen: Set<string>,
  config: MilaidyConfig,
  dbPrefs: SkillPreferencesMap,
): void {
  if (!fs.existsSync(dir)) return;

  for (const entry of fs.readdirSync(dir)) {
    if (
      entry.startsWith(".") ||
      entry === "node_modules" ||
      entry === "src" ||
      entry === "dist"
    )
      continue;

    const entryPath = path.join(dir, entry);
    let stat: fs.Stats;
    try {
      stat = fs.statSync(entryPath);
    } catch {
      continue;
    }

    if (!stat.isDirectory()) continue;

    const skillMd = path.join(entryPath, "SKILL.md");
    if (fs.existsSync(skillMd)) {
      if (seen.has(entry)) continue;
      seen.add(entry);

      try {
        const content = fs.readFileSync(skillMd, "utf-8");

        let skillName = entry;
        let description = "";

        // Parse YAML frontmatter
        const fmMatch = /^---\s*\n([\s\S]*?)\n---/.exec(content);
        if (fmMatch) {
          const fmBlock = fmMatch[1];
          const nameMatch = /^name:\s*(.+)$/m.exec(fmBlock);
          const descMatch = /^description:\s*(.+)$/m.exec(fmBlock);
          if (nameMatch)
            skillName = nameMatch[1].trim().replace(/^["']|["']$/g, "");
          if (descMatch)
            description = descMatch[1].trim().replace(/^["']|["']$/g, "");
        }

        // Fallback to heading / first paragraph
        if (!description) {
          const lines = content.split("\n");
          const heading = lines.find((l) => l.trim().startsWith("#"));
          if (heading) skillName = heading.replace(/^#+\s*/, "").trim();
          const descLine = lines.find(
            (l) =>
              l.trim() &&
              !l.trim().startsWith("#") &&
              !l.trim().startsWith("---"),
          );
          description = descLine?.trim() ?? "";
        }

        skills.push({
          id: entry,
          name: skillName,
          description: description.slice(0, 200),
          enabled: resolveSkillEnabled(entry, config, dbPrefs),
        });
      } catch {
        /* skip unreadable */
      }
    } else {
      // Recurse into subdirectories for nested skill groups
      scanSkillsDir(entryPath, skills, seen, config, dbPrefs);
    }
  }
}
