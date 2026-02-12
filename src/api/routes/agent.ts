import fs from "node:fs";
import type http from "node:http";
import os from "node:os";
import path from "node:path";
import type { AgentRuntime } from "@elizaos/core";
import { logger } from "@elizaos/core";
import { resolveStateDir } from "../../config/paths.js";
import {
  AgentExportError,
  estimateExportSize,
  exportAgent,
  importAgent,
} from "../../services/agent-export.js";
import type {
  AutonomyServiceLike,
  MilaidyConfig,
  RequestContext,
  ServerState,
} from "../types.js";
import {
  MAX_IMPORT_BYTES,
  error,
  json,
  readJsonBody,
  readRawBody,
} from "../utils.js";

/** Helper to retrieve the AutonomyService from a runtime (may be null). */
function getAutonomySvc(
  runtime: AgentRuntime | null,
): AutonomyServiceLike | null {
  if (!runtime) return null;
  return runtime.getService("AUTONOMY") as AutonomyServiceLike | null;
}

export async function handleAgentRoutes(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  pathname: string,
  method: string,
  state: ServerState,
  ctx?: RequestContext,
): Promise<boolean> {
  // ── POST /api/agent/start ───────────────────────────────────────────────
  if (method === "POST" && pathname === "/api/agent/start") {
    state.agentState = "running";
    state.startedAt = Date.now();
    const detectedModel = state.runtime
      ? (state.runtime.plugins.find(
          (p) =>
            p.name.includes("anthropic") ||
            p.name.includes("openai") ||
            p.name.includes("groq"),
        )?.name ?? "unknown")
      : "unknown";
    state.model = detectedModel;

    const svc = getAutonomySvc(state.runtime);
    if (svc) await svc.enableAutonomy();

    json(res, {
      ok: true,
      status: {
        state: state.agentState,
        agentName: state.agentName,
        model: state.model,
        uptime: 0,
        startedAt: state.startedAt,
      },
    });
    return true;
  }

  // ── POST /api/agent/stop ────────────────────────────────────────────────
  if (method === "POST" && pathname === "/api/agent/stop") {
    const svc = getAutonomySvc(state.runtime);
    if (svc) await svc.disableAutonomy();

    state.agentState = "stopped";
    state.startedAt = undefined;
    state.model = undefined;
    json(res, {
      ok: true,
      status: { state: state.agentState, agentName: state.agentName },
    });
    return true;
  }

  // ── POST /api/agent/pause ───────────────────────────────────────────────
  if (method === "POST" && pathname === "/api/agent/pause") {
    const svc = getAutonomySvc(state.runtime);
    if (svc) await svc.disableAutonomy();

    state.agentState = "paused";
    json(res, {
      ok: true,
      status: {
        state: state.agentState,
        agentName: state.agentName,
        model: state.model,
        uptime: state.startedAt ? Date.now() - state.startedAt : undefined,
        startedAt: state.startedAt,
      },
    });
    return true;
  }

  // ── POST /api/agent/resume ──────────────────────────────────────────────
  if (method === "POST" && pathname === "/api/agent/resume") {
    const svc = getAutonomySvc(state.runtime);
    if (svc) await svc.enableAutonomy();

    state.agentState = "running";
    json(res, {
      ok: true,
      status: {
        state: state.agentState,
        agentName: state.agentName,
        model: state.model,
        uptime: state.startedAt ? Date.now() - state.startedAt : undefined,
        startedAt: state.startedAt,
      },
    });
    return true;
  }

  // ── POST /api/agent/restart ────────────────────────────────────────────
  if (method === "POST" && pathname === "/api/agent/restart") {
    if (!ctx?.onRestart) {
      error(
        res,
        "Restart is not supported in this mode (no restart handler registered)",
        501,
      );
      return true;
    }

    if (state.agentState === "restarting") {
      error(res, "A restart is already in progress", 409);
      return true;
    }

    const previousState = state.agentState;
    state.agentState = "restarting";
    try {
      const newRuntime = await ctx.onRestart();
      if (newRuntime) {
        state.runtime = newRuntime;
        state.agentState = "running";
        state.agentName = newRuntime.character.name ?? "Milaidy";
        state.startedAt = Date.now();
        json(res, {
          ok: true,
          status: {
            state: state.agentState,
            agentName: state.agentName,
            startedAt: state.startedAt,
          },
        });
      } else {
        state.agentState = previousState;
        error(
          res,
          "Restart handler returned null — runtime failed to re-initialize",
          500,
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      state.agentState = previousState;
      error(res, `Restart failed: ${msg}`, 500);
    }
    return true;
  }

  // ── POST /api/agent/reset ──────────────────────────────────────────────
  if (method === "POST" && pathname === "/api/agent/reset") {
    try {
      if (state.runtime) {
        try {
          await state.runtime.stop();
        } catch (stopErr) {
          const msg =
            stopErr instanceof Error ? stopErr.message : String(stopErr);
          logger.warn(
            `[milaidy-api] Error stopping runtime during reset: ${msg}`,
          );
        }
        state.runtime = null;
      }

      const stateDir = resolveStateDir();
      const resolvedState = path.resolve(stateDir);
      const home = os.homedir();
      const isRoot =
        resolvedState === "/" || /^[A-Za-z]:\\?$/.test(resolvedState);
      const isSafe =
        !isRoot &&
        resolvedState !== home &&
        resolvedState.length > home.length &&
        (resolvedState.includes(`${path.sep}.milaidy`) ||
          resolvedState.includes(`${path.sep}milaidy`));
      if (!isSafe) {
        logger.warn(
          `[milaidy-api] Refusing to delete unsafe state dir: "${resolvedState}"`,
        );
        error(
          res,
          `Reset aborted: state directory "${resolvedState}" does not appear safe to delete`,
          400,
        );
        return true;
      }

      if (fs.existsSync(resolvedState)) {
        fs.rmSync(resolvedState, { recursive: true, force: true });
      }

      state.agentState = "stopped";
      state.agentName = "Milaidy";
      state.model = undefined;
      state.startedAt = undefined;
      state.config = {} as MilaidyConfig;
      state.chatRoomId = null;
      state.chatUserId = null;

      json(res, { ok: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      error(res, `Reset failed: ${msg}`, 500);
    }
    return true;
  }

  // ── POST /api/agent/export ─────────────────────────────────────────────
  if (method === "POST" && pathname === "/api/agent/export") {
    if (!state.runtime) {
      error(res, "Agent is not running — start it before exporting.", 503);
      return true;
    }

    const body = await readJsonBody<{
      password?: string;
      includeLogs?: boolean;
    }>(req, res);
    if (!body) return true;

    if (
      !body.password ||
      typeof body.password !== "string" ||
      body.password.length < 4
    ) {
      error(res, "A password of at least 4 characters is required.", 400);
      return true;
    }

    try {
      const fileBuffer = await exportAgent(state.runtime, body.password, {
        includeLogs: body.includeLogs === true,
      });

      const agentName = (state.runtime.character.name ?? "agent")
        .replace(/[^a-zA-Z0-9_-]/g, "_")
        .toLowerCase();
      const timestamp = new Date()
        .toISOString()
        .replace(/[:.]/g, "-")
        .slice(0, 19);
      const filename = `${agentName}-${timestamp}.eliza-agent`;

      res.statusCode = 200;
      res.setHeader("Content-Type", "application/octet-stream");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${filename}"`,
      );
      res.setHeader("Content-Length", fileBuffer.length);
      res.end(fileBuffer);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (err instanceof AgentExportError) {
        error(res, msg, 400);
      } else {
        error(res, `Export failed: ${msg}`, 500);
      }
    }
    return true;
  }

  // ── GET /api/agent/export/estimate ─────────────────────────────────────────
  if (method === "GET" && pathname === "/api/agent/export/estimate") {
    if (!state.runtime) {
      error(res, "Agent is not running.", 503);
      return true;
    }

    try {
      const estimate = await estimateExportSize(state.runtime);
      json(res, estimate);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      error(res, `Estimate failed: ${msg}`, 500);
    }
    return true;
  }

  // ── POST /api/agent/import ─────────────────────────────────────────────
  if (method === "POST" && pathname === "/api/agent/import") {
    if (!state.runtime) {
      error(res, "Agent is not running — start it before importing.", 503);
      return true;
    }

    let rawBody: Buffer;
    try {
      rawBody = await readRawBody(req, MAX_IMPORT_BYTES);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      error(res, msg, 413);
      return true;
    }

    if (rawBody.length < 5) {
      error(
        res,
        "Request body is too small — expected password + file data.",
        400,
      );
      return true;
    }

    const passwordLength = rawBody.readUInt32BE(0);
    if (passwordLength < 4 || passwordLength > 1024) {
      error(res, "Invalid password length in request envelope.", 400);
      return true;
    }
    if (rawBody.length < 4 + passwordLength + 1) {
      error(
        res,
        "Request body is incomplete — missing file data after password.",
        400,
      );
      return true;
    }

    const password = rawBody.subarray(4, 4 + passwordLength).toString("utf-8");
    const fileBuffer = rawBody.subarray(4 + passwordLength);

    try {
      const result = await importAgent(
        state.runtime,
        fileBuffer as Buffer,
        password,
      );
      json(res, result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (err instanceof AgentExportError) {
        error(res, msg, 400);
      } else {
        error(res, `Import failed: ${msg}`, 500);
      }
    }
    return true;
  }

  // ── POST /api/agent/autonomy ────────────────────────────────────────────
  if (method === "POST" && pathname === "/api/agent/autonomy") {
    json(res, { ok: true, autonomy: true });
    return true;
  }

  // ── GET /api/agent/autonomy ─────────────────────────────────────────────
  if (method === "GET" && pathname === "/api/agent/autonomy") {
    json(res, { enabled: true });
    return true;
  }

  return false;
}
