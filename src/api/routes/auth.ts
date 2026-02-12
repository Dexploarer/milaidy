import crypto from "node:crypto";
import type http from "node:http";
import { logger } from "@elizaos/core";
import { saveMilaidyConfig } from "../../config/config.js";
import type { ServerState } from "../types.js";
import {
  ensurePairingCode,
  error,
  getPairingState,
  json,
  normalizePairingCode,
  pairingEnabled,
  rateLimitPairing,
  readJsonBody,
  resetPairingCode,
} from "../utils.js";

export async function handleAuthRoutes(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  pathname: string,
  method: string,
  state: ServerState,
): Promise<boolean> {
  // ── GET /api/auth/status ───────────────────────────────────────────────
  if (method === "GET" && pathname === "/api/auth/status") {
    const required = Boolean(process.env.MILAIDY_API_TOKEN?.trim());
    const enabled = pairingEnabled();
    if (enabled) ensurePairingCode();
    json(res, {
      required,
      pairingEnabled: enabled,
      expiresAt: enabled ? getPairingState().expiresAt : null,
    });
    return true;
  }

  // ── POST /api/auth/pair ────────────────────────────────────────────────
  if (method === "POST" && pathname === "/api/auth/pair") {
    const body = await readJsonBody<{ code?: string }>(req, res);
    if (!body) return true;

    const token = process.env.MILAIDY_API_TOKEN?.trim();
    if (!token) {
      error(res, "Pairing not enabled", 400);
      return true;
    }
    if (!pairingEnabled()) {
      error(res, "Pairing disabled", 403);
      return true;
    }
    if (!rateLimitPairing(req.socket.remoteAddress ?? null)) {
      error(res, "Too many attempts. Try again later.", 429);
      return true;
    }

    const provided = normalizePairingCode(body.code ?? "");
    const current = ensurePairingCode();
    const { expiresAt } = getPairingState();

    if (!current || Date.now() > expiresAt) {
      ensurePairingCode();
      error(
        res,
        "Pairing code expired. Check server logs for a new code.",
        410,
      );
      return true;
    }

    const expected = normalizePairingCode(current);
    const a = Buffer.from(expected, "utf8");
    const b = Buffer.from(provided, "utf8");
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      error(res, "Invalid pairing code", 403);
      return true;
    }

    resetPairingCode();
    json(res, { token });
    return true;
  }

  // ── GET /api/subscription/status ──────────────────────────────────────
  if (method === "GET" && pathname === "/api/subscription/status") {
    try {
      const { getSubscriptionStatus } = await import("../../auth/index.js");
      json(res, { providers: getSubscriptionStatus() });
    } catch (err) {
      error(res, `Failed to get subscription status: ${err}`, 500);
    }
    return true;
  }

  // ── POST /api/subscription/anthropic/start ──────────────────────────────
  if (method === "POST" && pathname === "/api/subscription/anthropic/start") {
    try {
      const { startAnthropicLogin } = await import("../../auth/index.js");
      const flow = await startAnthropicLogin();
      state._anthropicFlow = flow;
      json(res, { authUrl: flow.authUrl });
    } catch (err) {
      error(res, `Failed to start Anthropic login: ${err}`, 500);
    }
    return true;
  }

  // ── POST /api/subscription/anthropic/exchange ───────────────────────────
  if (
    method === "POST" &&
    pathname === "/api/subscription/anthropic/exchange"
  ) {
    const body = await readJsonBody<{ code: string }>(req, res);
    if (!body) return true;
    if (!body.code) {
      error(res, "Missing code", 400);
      return true;
    }
    try {
      const { saveCredentials, applySubscriptionCredentials } = await import(
        "../../auth/index.js"
      );
      const flow = state._anthropicFlow;
      if (!flow) {
        error(res, "No active flow — call /start first", 400);
        return true;
      }
      flow.submitCode(body.code);
      const credentials = await flow.credentials;
      saveCredentials("anthropic-subscription", credentials);
      await applySubscriptionCredentials();
      delete state._anthropicFlow;
      json(res, { success: true, expiresAt: credentials.expires });
    } catch (err) {
      error(res, `Anthropic exchange failed: ${err}`, 500);
    }
    return true;
  }

  // ── POST /api/subscription/anthropic/setup-token ────────────────────────
  if (
    method === "POST" &&
    pathname === "/api/subscription/anthropic/setup-token"
  ) {
    const body = await readJsonBody<{ token: string }>(req, res);
    if (!body) return true;
    if (!body.token || !body.token.startsWith("sk-ant-")) {
      error(res, "Invalid token format — expected sk-ant-oat01-...", 400);
      return true;
    }
    try {
      process.env.ANTHROPIC_API_KEY = body.token.trim();
      if (!state.config.env) state.config.env = {};
      (state.config.env as Record<string, string>).ANTHROPIC_API_KEY =
        body.token.trim();
      saveMilaidyConfig(state.config);
      json(res, { success: true });
    } catch (err) {
      error(res, `Failed to save setup token: ${err}`, 500);
    }
    return true;
  }

  // ── POST /api/subscription/openai/start ─────────────────────────────────
  if (method === "POST" && pathname === "/api/subscription/openai/start") {
    try {
      const { startCodexLogin } = await import("../../auth/index.js");
      if (state._codexFlow) {
        try {
          state._codexFlow.close();
        } catch (err) {
          logger.debug(
            `[api] OAuth flow cleanup failed: ${err instanceof Error ? err.message : err}`,
          );
        }
      }
      clearTimeout(state._codexFlowTimer);

      const flow = await startCodexLogin();
      state._codexFlow = flow;
      state._codexFlowTimer = setTimeout(
        () => {
          try {
            flow.close();
          } catch (err) {
            logger.debug(
              `[api] OAuth flow cleanup failed: ${err instanceof Error ? err.message : err}`,
            );
          }
          delete state._codexFlow;
          delete state._codexFlowTimer;
        },
        10 * 60 * 1000,
      );
      json(res, {
        authUrl: flow.authUrl,
        state: flow.state,
        instructions:
          "Open the URL in your browser. After login, if auto-redirect doesn't work, paste the full redirect URL.",
      });
    } catch (err) {
      error(res, `Failed to start OpenAI login: ${err}`, 500);
    }
    return true;
  }

  // ── POST /api/subscription/openai/exchange ──────────────────────────────
  if (method === "POST" && pathname === "/api/subscription/openai/exchange") {
    const body = await readJsonBody<{
      code?: string;
      waitForCallback?: boolean;
    }>(req, res);
    if (!body) return true;
    let flow: import("../../auth/index.js").CodexFlow | undefined;
    try {
      const { saveCredentials, applySubscriptionCredentials } = await import(
        "../../auth/index.js"
      );
      flow = state._codexFlow;

      if (!flow) {
        error(res, "No active flow — call /start first", 400);
        return true;
      }

      if (body.code) {
        flow.submitCode(body.code);
      } else if (!body.waitForCallback) {
        error(res, "Provide either code or set waitForCallback: true", 400);
        return true;
      }

      let credentials: import("../../auth/index.js").OAuthCredentials;
      try {
        credentials = await flow.credentials;
      } catch (err) {
        try {
          flow.close();
        } catch (closeErr) {
          logger.debug(
            `[api] OAuth flow cleanup failed: ${closeErr instanceof Error ? closeErr.message : closeErr}`,
          );
        }
        delete state._codexFlow;
        clearTimeout(state._codexFlowTimer);
        delete state._codexFlowTimer;
        error(res, `OpenAI exchange failed: ${err}`, 500);
        return true;
      }
      saveCredentials("openai-codex", credentials);
      await applySubscriptionCredentials();
      flow.close();
      delete state._codexFlow;
      clearTimeout(state._codexFlowTimer);
      delete state._codexFlowTimer;
      json(res, {
        success: true,
        expiresAt: credentials.expires,
        accountId: credentials.accountId,
      });
    } catch (err) {
      error(res, `OpenAI exchange failed: ${err}`, 500);
    }
    return true;
  }

  // ── DELETE /api/subscription/:provider ───────────────────────────────────
  if (method === "DELETE" && pathname.startsWith("/api/subscription/")) {
    const provider = pathname.split("/").pop();
    if (provider === "anthropic-subscription" || provider === "openai-codex") {
      try {
        const { deleteCredentials } = await import("../../auth/index.js");
        deleteCredentials(provider);
        json(res, { success: true });
      } catch (err) {
        error(res, `Failed to delete credentials: ${err}`, 500);
      }
    } else {
      error(res, `Unknown provider: ${provider}`, 400);
    }
    return true;
  }

  return false;
}
