import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { logger } from "@elizaos/core";
import { type ServerState } from "../types.js";
import { readJsonBody, json, error, redactConfigSecrets, redactDeep } from "../utils.js";
import { loadMilaidyConfig, saveMilaidyConfig } from "../../config/config.js";

export async function handleMiscRoute(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  pathname: string,
  method: string,
  state: ServerState
): Promise<boolean> {
  const url = new URL(
    req.url ?? "/",
    `http://${req.headers.host ?? "localhost"}`,
  );

  // ── GET /api/logs ───────────────────────────────────────────────────────
  if (method === "GET" && pathname === "/api/logs") {
    let entries = state.logBuffer;

    const sourceFilter = url.searchParams.get("source");
    if (sourceFilter)
      entries = entries.filter((e) => e.source === sourceFilter);

    const levelFilter = url.searchParams.get("level");
    if (levelFilter) entries = entries.filter((e) => e.level === levelFilter);

    // Filter by tag — entries must contain the requested tag
    const tagFilter = url.searchParams.get("tag");
    if (tagFilter) entries = entries.filter((e) => e.tags.includes(tagFilter));

    const sinceFilter = url.searchParams.get("since");
    if (sinceFilter) {
      const sinceTs = Number(sinceFilter);
      if (!Number.isNaN(sinceTs))
        entries = entries.filter((e) => e.timestamp >= sinceTs);
    }

    const sources = [...new Set(state.logBuffer.map((e) => e.source))].sort();
    const tags = [...new Set(state.logBuffer.flatMap((e) => e.tags))].sort();
    json(res, { entries: entries.slice(-200), sources, tags });
    return true;
  }

  // ── GET /api/extension/status ─────────────────────────────────────────
  if (method === "GET" && pathname === "/api/extension/status") {
    const relayPort = 18792;
    let relayReachable = false;
    try {
      const resp = await fetch(`http://127.0.0.1:${relayPort}/`, {
        method: "HEAD",
        signal: AbortSignal.timeout(2000),
      });
      relayReachable = resp.ok || resp.status < 500;
    } catch {
      relayReachable = false;
    }

    // Resolve the extension source path (always available in the repo)
    let extensionPath: string | null = null;
    try {
      const serverDir = path.dirname(new URL(import.meta.url).pathname);
      extensionPath = path.resolve(
        serverDir,
        "..",
        "..",
        "..", // Adjusted for src/api/routes depth
        "apps",
        "chrome-extension",
      );
      if (!fs.existsSync(extensionPath)) extensionPath = null;
    } catch {
      // ignore
    }

    json(res, { relayReachable, relayPort, extensionPath });
    return true;
  }

  // ── GET /api/update/status ───────────────────────────────────────────────
  if (method === "GET" && pathname === "/api/update/status") {
    const { VERSION } = await import("../../runtime/version.js");
    const {
      resolveChannel,
      checkForUpdate,
      fetchAllChannelVersions,
      CHANNEL_DIST_TAGS,
    } = await import("../../services/update-checker.js");
    const { detectInstallMethod } = await import("../../services/self-updater.js");
    const channel = resolveChannel(state.config.update);

    const [check, versions] = await Promise.all([
      checkForUpdate({ force: req.url?.includes("force=true") }),
      fetchAllChannelVersions(),
    ]);

    json(res, {
      currentVersion: VERSION,
      channel,
      installMethod: detectInstallMethod(),
      updateAvailable: check.updateAvailable,
      latestVersion: check.latestVersion,
      channels: {
        stable: versions.stable,
        beta: versions.beta,
        nightly: versions.nightly,
      },
      distTags: CHANNEL_DIST_TAGS,
      lastCheckAt: state.config.update?.lastCheckAt ?? null,
      error: check.error,
    });
    return true;
  }

  // ── PUT /api/update/channel ────────────────────────────────────────────
  if (method === "PUT" && pathname === "/api/update/channel") {
    const body = (await readJsonBody(req, res)) as { channel?: string } | null;
    if (!body) return true;
    const ch = body.channel;
    if (ch !== "stable" && ch !== "beta" && ch !== "nightly") {
      error(res, `Invalid channel "${ch}". Must be stable, beta, or nightly.`);
      return true;
    }
    state.config.update = {
      ...state.config.update,
      channel: ch,
      lastCheckAt: undefined,
      lastCheckVersion: undefined,
    };
    saveMilaidyConfig(state.config);
    json(res, { channel: ch });
    return true;
  }

  // ── GET /api/config ──────────────────────────────────────────────────────
  if (method === "GET" && pathname === "/api/config") {
    json(res, redactConfigSecrets(state.config));
    return true;
  }

  // ── PUT /api/config ─────────────────────────────────────────────────────
  if (method === "PUT" && pathname === "/api/config") {
    const body = await readJsonBody(req, res);
    if (!body) return true;

    // --- Security: validate and safely merge config updates ----------------

    // Only accept known top-level keys from MilaidyConfig.
    const ALLOWED_TOP_KEYS = new Set([
      "meta",
      "auth",
      "env",
      "wizard",
      "diagnostics",
      "logging",
      "update",
      "browser",
      "ui",
      "skills",
      "plugins",
      "models",
      "nodeHost",
      "agents",
      "tools",
      "bindings",
      "broadcast",
      "audio",
      "messages",
      "commands",
      "approvals",
      "session",
      "web",
      "channels",
      "cron",
      "hooks",
      "discovery",
      "talk",
      "gateway",
      "memory",
      "database",
      "cloud",
      "x402",
      "mcp",
      "features",
    ]);

    const BLOCKED_KEYS = new Set(["__proto__", "constructor", "prototype"]);

    function safeMerge(
      target: Record<string, unknown>,
      src: Record<string, unknown>,
    ): void {
      for (const key of Object.keys(src)) {
        if (BLOCKED_KEYS.has(key)) continue;
        const srcVal = src[key];
        const tgtVal = target[key];
        if (
          srcVal !== null &&
          typeof srcVal === "object" &&
          !Array.isArray(srcVal) &&
          tgtVal !== null &&
          typeof tgtVal === "object" &&
          !Array.isArray(tgtVal)
        ) {
          safeMerge(
            tgtVal as Record<string, unknown>,
            srcVal as Record<string, unknown>,
          );
        } else {
          target[key] = srcVal;
        }
      }
    }

    const filtered: Record<string, unknown> = {};
    for (const key of Object.keys(body)) {
      if (ALLOWED_TOP_KEYS.has(key) && !BLOCKED_KEYS.has(key)) {
        filtered[key] = body[key];
      }
    }

    safeMerge(state.config as Record<string, unknown>, filtered);

    try {
      saveMilaidyConfig(state.config);
    } catch (err) {
      logger.warn(
        `[api] Config save failed: ${err instanceof Error ? err.message : err}`,
      );
    }
    json(res, redactConfigSecrets(state.config));
    return true;
  }

  return false;
}
