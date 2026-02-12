/**
 * REST API server for the Milaidy Control UI.
 *
 * Exposes HTTP endpoints that the UI frontend expects, backed by the
 * ElizaOS AgentRuntime. Default port: 2138. In dev mode, the Vite UI
 * dev server proxies /api and /ws here (see scripts/dev-ui.mjs).
 */

import http from "node:http";
import { type AgentRuntime, logger } from "@elizaos/core";
import { type WebSocket, WebSocketServer } from "ws";
import { CloudManager } from "../cloud/cloud-manager.js";
import { loadMilaidyConfig, type MilaidyConfig } from "../config/config.js";
import { resolveDefaultAgentWorkspaceDir } from "../providers/workspace.js";
import { AppManager } from "../services/app-manager.js";
import { discoverPluginsFromManifest, discoverSkills } from "./discovery.js";
import { handleAgentRoutes } from "./routes/agent.js";
import { handleAppRoutes } from "./routes/apps.js";
import { handleAuthRoutes } from "./routes/auth.js";
import { handleCharacterRoutes } from "./routes/character.js";
import { handleCloudRoutes } from "./routes/cloud.js";
import { handleConversationRoutes } from "./routes/conversations.js";
import { handleDatabaseRoutes } from "./routes/database.js";
import { handleDebugRoutes } from "./routes/debug.js";
import { handleIngestRoutes } from "./routes/ingest.js";
import { handleMcpRoutes } from "./routes/mcp.js";
import { handleOnboardingRoutes } from "./routes/onboarding.js";
import { handlePluginRoutes } from "./routes/plugins.js";
import { handleRegistryRoutes } from "./routes/registry.js";
import { handleSkillRoutes } from "./routes/skills.js";
import { handleWalletRoutes } from "./routes/wallet.js";
import { handleWorkbenchRoutes } from "./routes/workbench.js";
import type { LogEntry, RequestContext, ServerState } from "./types.js";
import { applyCors, error, isAuthorized, json } from "./utils.js";

// ---------------------------------------------------------------------------
// Request handler
// ---------------------------------------------------------------------------

async function handleRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  state: ServerState,
  ctx?: RequestContext,
): Promise<void> {
  const method = req.method ?? "GET";
  const url = new URL(
    req.url ?? "/",
    `http://${req.headers.host ?? "localhost"}`,
  );
  const pathname = url.pathname;
  const isAuthEndpoint = pathname.startsWith("/api/auth/");

  if (!applyCors(req, res)) {
    json(res, { error: "Origin not allowed" }, 403);
    return;
  }

  if (method !== "OPTIONS" && !isAuthEndpoint && !isAuthorized(req)) {
    json(res, { error: "Unauthorized" }, 401);
    return;
  }

  // CORS preflight
  if (method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  // Route delegation
  if (await handleAuthRoutes(req, res, pathname, method, state)) return;
  if (await handleAgentRoutes(req, res, pathname, method, state, ctx)) return;
  if (await handleCharacterRoutes(req, res, pathname, method, state)) return;
  if (await handleConversationRoutes(req, res, pathname, method, state)) return;
  if (await handlePluginRoutes(req, res, pathname, method, state, ctx)) return;
  if (await handleSkillRoutes(req, res, pathname, method, state)) return;
  if (await handleWalletRoutes(req, res, pathname, method, state)) return;
  if (await handleOnboardingRoutes(req, res, pathname, method, state)) return;
  if (await handleDebugRoutes(req, res, pathname, method, state)) return;
  if (await handleRegistryRoutes(req, res, pathname, method, state)) return;
  if (await handleMcpRoutes(req, res, pathname, method, state)) return;
  if (await handleWorkbenchRoutes(req, res, pathname, method, state)) return;
  if (await handleAppRoutes(req, res, pathname, method, state)) return;
  if (await handleIngestRoutes(req, res, pathname, method, state)) return;
  if (await handleCloudRoutes(req, res, pathname, method, state)) return;
  if (await handleDatabaseRoutes(req, res, pathname, method, state)) return;

  // Fallback
  error(res, "Not found", 404);
}

// ---------------------------------------------------------------------------
// Early log capture
// ---------------------------------------------------------------------------

interface EarlyLogEntry {
  timestamp: number;
  level: string;
  message: string;
  source: string;
  tags: string[];
}

let earlyLogBuffer: EarlyLogEntry[] | null = null;
let earlyPatchCleanup: (() => void) | null = null;

export function captureEarlyLogs(): void {
  if (earlyLogBuffer) return;
  if ((logger as unknown as Record<string, unknown>).__milaidyLogPatched)
    return;
  earlyLogBuffer = [];
  const EARLY_PATCHED = "__milaidyEarlyPatched";
  if ((logger as unknown as Record<string, unknown>)[EARLY_PATCHED]) return;

  const LEVELS = ["debug", "info", "warn", "error"] as const;
  const originals = new Map<string, (...args: unknown[]) => void>();

  for (const lvl of LEVELS) {
    const original = logger[lvl].bind(logger);
    originals.set(lvl, original as (...args: unknown[]) => void);
    const earlyPatched: (typeof logger)[typeof lvl] = (
      ...args: Parameters<typeof original>
    ) => {
      let msg = "";
      let source = "agent";
      const tags = ["agent"];
      if (typeof args[0] === "string") {
        msg = args[0];
      } else if (args[0] && typeof args[0] === "object") {
        const obj = args[0] as Record<string, unknown>;
        if (typeof obj.src === "string") source = obj.src;
        msg = typeof args[1] === "string" ? args[1] : JSON.stringify(obj);
      }
      const bracketMatch = /^\[([^\]]+)\]\s*/.exec(msg);
      if (bracketMatch && source === "agent") source = bracketMatch[1];
      if (source !== "agent" && !tags.includes(source)) tags.push(source);
      earlyLogBuffer?.push({
        timestamp: Date.now(),
        level: lvl,
        message: msg,
        source,
        tags,
      });
      return original(...args);
    };
    logger[lvl] = earlyPatched;
  }

  (logger as unknown as Record<string, unknown>)[EARLY_PATCHED] = true;

  earlyPatchCleanup = () => {
    for (const lvl of LEVELS) {
      const orig = originals.get(lvl);
      if (orig) logger[lvl] = orig as (typeof logger)[typeof lvl];
    }
    delete (logger as unknown as Record<string, unknown>)[EARLY_PATCHED];
    delete (logger as unknown as Record<string, unknown>).__milaidyLogPatched;
  };
}

// ---------------------------------------------------------------------------
// Server start
// ---------------------------------------------------------------------------

export async function startApiServer(opts?: {
  port?: number;
  runtime?: AgentRuntime;
  onRestart?: () => Promise<AgentRuntime | null>;
}): Promise<{
  port: number;
  close: () => Promise<void>;
  updateRuntime: (rt: AgentRuntime) => void;
}> {
  const port = opts?.port ?? 2138;
  const host =
    (process.env.MILAIDY_API_BIND ?? "127.0.0.1").trim() || "127.0.0.1";

  let config: MilaidyConfig;
  try {
    config = loadMilaidyConfig();
  } catch (err) {
    logger.warn(
      `[milaidy-api] Failed to load config, starting with defaults: ${err instanceof Error ? err.message : err}`,
    );
    config = {} as MilaidyConfig;
  }

  const plugins = discoverPluginsFromManifest();
  const workspaceDir =
    config.agents?.defaults?.workspace ?? resolveDefaultAgentWorkspaceDir();
  const skills = await discoverSkills(
    workspaceDir,
    config,
    opts?.runtime ?? null,
  );

  const hasRuntime = opts?.runtime != null;
  const agentName = hasRuntime
    ? (opts.runtime?.character.name ?? "Milaidy")
    : (config.agents?.list?.[0]?.name ??
      config.ui?.assistant?.name ??
      "Milaidy");

  const state: ServerState = {
    runtime: opts?.runtime ?? null,
    config,
    agentState: hasRuntime ? "running" : "not_started",
    agentName,
    model: hasRuntime ? "provided" : undefined,
    startedAt: hasRuntime ? Date.now() : undefined,
    plugins,
    skills,
    logBuffer: [],
    chatRoomId: null,
    chatUserId: null,
    conversations: new Map(),
    cloudManager: null,
    appManager: new AppManager(),
    shareIngestQueue: [],
  };

  const addLog = (
    level: string,
    message: string,
    source = "system",
    tags: string[] = [],
  ) => {
    let resolvedSource = source;
    if (source === "auto" || source === "system") {
      const bracketMatch = /^\[([^\]]+)\]\s*/.exec(message);
      if (bracketMatch) resolvedSource = bracketMatch[1];
    }
    const resolvedTags =
      tags.length > 0
        ? tags
        : resolvedSource === "runtime" || resolvedSource === "autonomy"
          ? ["agent"]
          : resolvedSource === "api" || resolvedSource === "websocket"
            ? ["server"]
            : resolvedSource === "cloud"
              ? ["server", "cloud"]
              : ["system"];
    state.logBuffer.push({
      timestamp: Date.now(),
      level,
      message,
      source: resolvedSource,
      tags: resolvedTags,
    });
    if (state.logBuffer.length > 1000) state.logBuffer.shift();
  };

  if (earlyLogBuffer && earlyLogBuffer.length > 0) {
    for (const entry of earlyLogBuffer) {
      state.logBuffer.push(entry as LogEntry);
    }
    if (state.logBuffer.length > 1000) {
      state.logBuffer.splice(0, state.logBuffer.length - 1000);
    }
    addLog(
      "info",
      `Flushed ${earlyLogBuffer.length} early startup log entries`,
      "system",
      ["system"],
    );
  }
  if (earlyPatchCleanup) {
    earlyPatchCleanup();
    earlyPatchCleanup = null;
  }
  earlyLogBuffer = null;

  if (config.cloud?.enabled && config.cloud?.apiKey) {
    const mgr = new CloudManager(config.cloud, {
      onStatusChange: (s) => {
        addLog("info", `Cloud connection status: ${s}`, "cloud", [
          "server",
          "cloud",
        ]);
      },
    });
    mgr.init();
    state.cloudManager = mgr;
    addLog("info", "Cloud manager initialised (Eliza Cloud enabled)", "cloud", [
      "server",
      "cloud",
    ]);
  }

  addLog(
    "info",
    `Discovered ${plugins.length} plugins, ${skills.length} skills`,
    "system",
    ["system", "plugins"],
  );

  const PATCHED_MARKER = "__milaidyLogPatched";
  const LEVELS = ["debug", "info", "warn", "error"] as const;

  const patchLogger = (
    target: typeof logger,
    defaultSource: string,
    defaultTags: string[],
  ): boolean => {
    if ((target as unknown as Record<string, unknown>)[PATCHED_MARKER]) {
      return false;
    }

    for (const lvl of LEVELS) {
      const original = target[lvl].bind(target);
      const patched: (typeof target)[typeof lvl] = (
        ...args: Parameters<typeof original>
      ) => {
        let msg = "";
        let source = defaultSource;
        let tags = [...defaultTags];
        if (typeof args[0] === "string") {
          msg = args[0];
        } else if (args[0] && typeof args[0] === "object") {
          const obj = args[0] as Record<string, unknown>;
          if (typeof obj.src === "string") source = obj.src;
          if (Array.isArray(obj.tags)) {
            tags = [...tags, ...(obj.tags as string[])];
          }
          msg = typeof args[1] === "string" ? args[1] : JSON.stringify(obj);
        }
        const bracketMatch = /^\[([^\]]+)\]\s*/.exec(msg);
        if (bracketMatch && source === defaultSource) {
          source = bracketMatch[1];
        }
        if (source !== defaultSource && !tags.includes(source)) {
          tags.push(source);
        }
        if (msg) addLog(lvl, msg, source, tags);
        return original(...args);
      };
      target[lvl] = patched;
    }

    (target as unknown as Record<string, unknown>)[PATCHED_MARKER] = true;
    return true;
  };

  if (patchLogger(logger, "agent", ["agent"])) {
    addLog(
      "info",
      "Global logger connected — all agent logs will stream to the UI",
      "system",
      ["system", "agent"],
    );
  }

  if (opts?.runtime?.logger && opts.runtime.logger !== logger) {
    if (patchLogger(opts.runtime.logger, "runtime", ["agent", "runtime"])) {
      addLog(
        "info",
        "Runtime logger connected — runtime logs will stream to the UI",
        "system",
        ["system", "agent"],
      );
    }
  }

  if (opts?.runtime) {
    addLog(
      "info",
      "Autonomy is always enabled — managed by the core task system",
      "autonomy",
      ["agent", "autonomy"],
    );
  }

  const onRestart = opts?.onRestart ?? null;

  const server = http.createServer(async (req, res) => {
    try {
      await handleRequest(req, res, state, { onRestart });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "internal error";
      addLog("error", msg, "api", ["server", "api"]);
      error(res, msg, 500);
    }
  });

  const wss = new WebSocketServer({ noServer: true });
  const wsClients = new Set<WebSocket>();

  server.on("upgrade", (request, socket, head) => {
    try {
      const { pathname: wsPath } = new URL(
        request.url ?? "/",
        `http://${request.headers.host}`,
      );
      if (wsPath === "/ws") {
        wss.handleUpgrade(request, socket, head, (ws) => {
          wss.emit("connection", ws, request);
        });
      } else {
        socket.destroy();
      }
    } catch (err) {
      logger.error(
        `[milaidy-api] WebSocket upgrade error: ${err instanceof Error ? err.message : err}`,
      );
      socket.destroy();
    }
  });

  wss.on("connection", (ws: WebSocket) => {
    wsClients.add(ws);
    addLog("info", "WebSocket client connected", "websocket", [
      "server",
      "websocket",
    ]);

    try {
      ws.send(
        JSON.stringify({
          type: "status",
          state: state.agentState,
          agentName: state.agentName,
          model: state.model,
          startedAt: state.startedAt,
        }),
      );
    } catch (err) {
      logger.error(
        `[milaidy-api] WebSocket send error: ${err instanceof Error ? err.message : err}`,
      );
    }

    ws.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === "ping") {
          ws.send(JSON.stringify({ type: "pong" }));
        }
      } catch (err) {
        logger.error(
          `[milaidy-api] WebSocket message error: ${err instanceof Error ? err.message : err}`,
        );
      }
    });

    ws.on("close", () => {
      wsClients.delete(ws);
      addLog("info", "WebSocket client disconnected", "websocket", [
        "server",
        "websocket",
      ]);
    });

    ws.on("error", (err) => {
      logger.error(
        `[milaidy-api] WebSocket error: ${err instanceof Error ? err.message : err}`,
      );
      wsClients.delete(ws);
    });
  });

  const broadcastStatus = () => {
    const statusData = {
      type: "status",
      state: state.agentState,
      agentName: state.agentName,
      model: state.model,
      startedAt: state.startedAt,
    };
    const message = JSON.stringify(statusData);
    for (const client of wsClients) {
      if (client.readyState === 1) {
        try {
          client.send(message);
        } catch (err) {
          logger.error(
            `[milaidy-api] WebSocket broadcast error: ${err instanceof Error ? err.message : err}`,
          );
        }
      }
    }
  };

  const statusInterval = setInterval(broadcastStatus, 5000);

  const restoreConversationsFromDb = async (
    rt: AgentRuntime,
  ): Promise<void> => {
    try {
      // NOTE: Using a dynamic import for stringToUuid to avoid importing it at top level if not needed,
      // but it is needed here. It's exported from @elizaos/core.
      const { stringToUuid } = await import("@elizaos/core");
      const agentName = rt.character.name ?? "Milaidy";
      const worldId = stringToUuid(`${agentName}-web-chat-world`);
      const rooms = await rt.getRoomsByWorld(worldId);
      if (!rooms?.length) return;

      let restored = 0;
      for (const room of rooms) {
        const channelId =
          typeof room.channelId === "string" ? room.channelId : "";
        if (!channelId.startsWith("web-conv-")) continue;
        const convId = channelId.replace("web-conv-", "");
        if (!convId || state.conversations.has(convId)) continue;

        let updatedAt = new Date().toISOString();
        try {
          const msgs = await rt.getMemories({
            roomId: room.id as import("@elizaos/core").UUID,
            tableName: "messages",
            count: 1,
          });
          if (msgs.length > 0 && msgs[0].createdAt) {
            updatedAt = new Date(msgs[0].createdAt).toISOString();
          }
        } catch {
          // non-fatal
        }

        state.conversations.set(convId, {
          id: convId,
          title:
            ((room as unknown as Record<string, unknown>).name as string) ||
            "Chat",
          roomId: room.id as import("@elizaos/core").UUID,
          createdAt: updatedAt,
          updatedAt,
        });
        restored++;
      }
      if (restored > 0) {
        addLog(
          "info",
          `Restored ${restored} conversation(s) from database`,
          "system",
          ["system"],
        );
      }
    } catch (err) {
      logger.warn(
        `[milaidy-api] Failed to restore conversations from DB: ${err instanceof Error ? err.message : err}`,
      );
    }
  };

  if (opts?.runtime) {
    void restoreConversationsFromDb(opts.runtime);
  }

  const updateRuntime = (rt: AgentRuntime): void => {
    state.runtime = rt;
    state.agentState = "running";
    state.agentName = rt.character.name ?? "Milaidy";
    state.startedAt = Date.now();
    addLog("info", `Runtime restarted — agent: ${state.agentName}`, "system", [
      "system",
      "agent",
    ]);

    void restoreConversationsFromDb(rt);
    broadcastStatus();
  };

  return new Promise((resolve) => {
    server.listen(port, host, () => {
      const addr = server.address();
      const actualPort = typeof addr === "object" && addr ? addr.port : port;
      const displayHost =
        typeof addr === "object" && addr ? addr.address : host;
      addLog(
        "info",
        `API server listening on http://${displayHost}:${actualPort}`,
        "system",
        ["server", "system"],
      );
      logger.info(
        `[milaidy-api] Listening on http://${displayHost}:${actualPort}`,
      );
      resolve({
        port: actualPort,
        close: () =>
          new Promise<void>((r) => {
            clearInterval(statusInterval);
            wss.close();
            server.close(() => r());
          }),
        updateRuntime,
      });
    });
  });
}
