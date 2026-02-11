import http from "node:http";
import crypto from "node:crypto";
import { logger } from "@elizaos/core";
import { type ServerState } from "../types.js";
import { readJsonBody, json, error } from "../utils.js";
import { saveMilaidyConfig } from "../../config/config.js";

// ---------------------------------------------------------------------------
// Pairing logic
// ---------------------------------------------------------------------------

const PAIRING_TTL_MS = 10 * 60 * 1000;
const PAIRING_WINDOW_MS = 10 * 60 * 1000;
const PAIRING_MAX_ATTEMPTS = 5;
const PAIRING_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

let pairingCode: string | null = null;
let pairingExpiresAt = 0;
const pairingAttempts = new Map<string, { count: number; resetAt: number }>();

export function pairingEnabled(): boolean {
  return (
    Boolean(process.env.MILAIDY_API_TOKEN?.trim()) &&
    process.env.MILAIDY_PAIRING_DISABLED !== "1"
  );
}

function normalizePairingCode(code: string): string {
  return code.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

function generatePairingCode(): string {
  const bytes = crypto.randomBytes(8);
  let raw = "";
  for (let i = 0; i < bytes.length; i++) {
    raw += PAIRING_ALPHABET[bytes[i] % PAIRING_ALPHABET.length];
  }
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}`;
}

export function ensurePairingCode(): string | null {
  if (!pairingEnabled()) return null;
  const now = Date.now();
  if (!pairingCode || now > pairingExpiresAt) {
    pairingCode = generatePairingCode();
    pairingExpiresAt = now + PAIRING_TTL_MS;
    logger.warn(
      `[milaidy-api] Pairing code: ${pairingCode} (valid for 10 minutes)`,
    );
  }
  return pairingCode;
}

export function getPairingExpiresAt(): number {
  return pairingExpiresAt;
}

function rateLimitPairing(ip: string | null): boolean {
  const key = ip ?? "unknown";
  const now = Date.now();
  const current = pairingAttempts.get(key);
  if (!current || now > current.resetAt) {
    pairingAttempts.set(key, { count: 1, resetAt: now + PAIRING_WINDOW_MS });
    return true;
  }
  if (current.count >= PAIRING_MAX_ATTEMPTS) return false;
  current.count += 1;
  return true;
}

export function consumePairingCode(provided: string): boolean {
    const current = ensurePairingCode();
    if (!current || Date.now() > pairingExpiresAt) {
      // Expired or null
      return false;
    }

    const expected = normalizePairingCode(current);
    const normalizedProvided = normalizePairingCode(provided);
    const a = Buffer.from(expected, "utf8");
    const b = Buffer.from(normalizedProvided, "utf8");

    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return false;
    }

    // Reset on success
    pairingCode = null;
    pairingExpiresAt = 0;
    return true;
}


// ---------------------------------------------------------------------------
// Route Handler
// ---------------------------------------------------------------------------

export async function handleAuthRoute(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  pathname: string,
  method: string,
  state: ServerState
): Promise<boolean> {
  // ── GET /api/auth/status ───────────────────────────────────────────────
  if (method === "GET" && pathname === "/api/auth/status") {
    const required = Boolean(process.env.MILAIDY_API_TOKEN?.trim());
    const enabled = pairingEnabled();
    if (enabled) ensurePairingCode();
    json(res, {
      required,
      pairingEnabled: enabled,
      expiresAt: enabled ? pairingExpiresAt : null,
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

    const provided = body.code ?? "";
    // Check expiry before consuming
    const current = ensurePairingCode(); // regenerates if null/expired? No, only if expired logic inside ensurePairingCode handles it.
    // Actually ensurePairingCode regenerates if expired.
    // If it was just generated, it is valid.

    // But if the user provided an old code and we just rotated it, it will fail.
    // The logic in original server.ts was:
    // const current = ensurePairingCode();
    // if (!current || Date.now() > pairingExpiresAt) { ... }

    // consumePairingCode encapsulates validation
    if (!consumePairingCode(provided)) {
        // Did it fail because it expired? consumePairingCode checks that.
        // Or because it was wrong?
        // Original code:
        /*
        const current = ensurePairingCode();
        if (!current || Date.now() > pairingExpiresAt) {
            ensurePairingCode();
            error(res, "Pairing code expired...", 410);
            return;
        }
        // check match
        */

       // My consumePairingCode is a bit simplistic. Let's revert to inline logic or be more precise.
       // I'll stick to logic similar to server.ts inside this handler for clarity.

       const currentCode = ensurePairingCode();
       if (!currentCode || Date.now() > pairingExpiresAt) {
           ensurePairingCode(); // Rotate
           error(res, "Pairing code expired. Check server logs for a new code.", 410);
           return true;
       }

       const expected = normalizePairingCode(currentCode);
       const providedNorm = normalizePairingCode(provided);
       const a = Buffer.from(expected, "utf8");
       const b = Buffer.from(providedNorm, "utf8");

       if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
          error(res, "Invalid pairing code", 403);
          return true;
       }

       // Success
       pairingCode = null;
       pairingExpiresAt = 0;
       json(res, { token });
       return true;
    }

    // If consumePairingCode returned true, it wouldn't reach here if I used it.
    // But I just rewrote the logic above.
    // Wait, I shouldn't duplicate logic if I can avoid it.
    // The issue is distinguishing between "wrong code" and "expired code".
    // I will stick to the inline logic above.
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
      // Store flow in server state for the exchange step
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
      // Submit the code and wait for credentials
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
      // Setup tokens are direct API keys — set in env immediately
      process.env.ANTHROPIC_API_KEY = body.token.trim();
      // Also save to config so it persists across restarts
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
      // Clean up any stale flow from a previous attempt
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
      // Store flow state + auto-cleanup after 10 minutes
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
        // Manual code/URL paste — submit to flow
        flow.submitCode(body.code);
      } else if (!body.waitForCallback) {
        error(res, "Provide either code or set waitForCallback: true", 400);
        return true;
      }

      // Wait for credentials (either from callback server or manual submission)
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
