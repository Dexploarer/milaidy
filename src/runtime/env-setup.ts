import process from "node:process";
import { logger } from "@elizaos/core";
import type { MilaidyConfig } from "../config/config.js";

// ---------------------------------------------------------------------------
// Channel secret mapping
// ---------------------------------------------------------------------------

/**
 * Maps Milaidy channel config fields to the environment variable names
 * that ElizaOS plugins expect.
 *
 * Milaidy stores channel credentials under `config.channels.<name>.<field>`,
 * while ElizaOS plugins read them from process.env.
 */
const CHANNEL_ENV_MAP: Readonly<
  Record<string, Readonly<Record<string, string>>>
> = {
  discord: {
    token: "DISCORD_BOT_TOKEN",
  },
  telegram: {
    botToken: "TELEGRAM_BOT_TOKEN",
  },
  slack: {
    botToken: "SLACK_BOT_TOKEN",
    appToken: "SLACK_APP_TOKEN",
    userToken: "SLACK_USER_TOKEN",
  },
  signal: {
    account: "SIGNAL_ACCOUNT",
  },
  msteams: {
    appId: "MSTEAMS_APP_ID",
    appPassword: "MSTEAMS_APP_PASSWORD",
  },
  mattermost: {
    botToken: "MATTERMOST_BOT_TOKEN",
    baseUrl: "MATTERMOST_BASE_URL",
  },
  googlechat: {
    serviceAccountKey: "GOOGLE_CHAT_SERVICE_ACCOUNT_KEY",
  },
};

/**
 * Propagate channel credentials from Milaidy config into process.env so
 * that ElizaOS plugins can find them.
 */
/** @internal Exported for testing. */
export function applyConnectorSecretsToEnv(config: MilaidyConfig): void {
  // Prefer config.connectors, fall back to config.channels for backward compatibility
  const connectors = config.connectors ?? config.channels ?? {};

  for (const [channelName, channelConfig] of Object.entries(connectors)) {
    if (!channelConfig || typeof channelConfig !== "object") continue;

    const envMap = CHANNEL_ENV_MAP[channelName];
    if (!envMap) continue;

    const configObj = channelConfig as Record<string, unknown>;
    for (const [configField, envKey] of Object.entries(envMap)) {
      const value = configObj[configField];
      if (typeof value === "string" && value.trim() && !process.env[envKey]) {
        process.env[envKey] = value;
      }
    }
  }
}

/**
 * Propagate cloud config from Milaidy config into process.env so the
 * ElizaCloud plugin can discover settings at startup.
 */
/** @internal Exported for testing. */
export function applyCloudConfigToEnv(config: MilaidyConfig): void {
  const cloud = config.cloud;
  if (!cloud) return;

  // Having an API key means the user logged in — treat as enabled even if
  // the flag was accidentally reset (e.g. by a provider switch or merge).
  const effectivelyEnabled = cloud.enabled || Boolean(cloud.apiKey);

  if (effectivelyEnabled) {
    process.env.ELIZAOS_CLOUD_ENABLED = "true";
    logger.info(
      `[milaidy] Cloud config: enabled=${cloud.enabled}, hasApiKey=${Boolean(cloud.apiKey)}, baseUrl=${cloud.baseUrl ?? "(default)"}`,
    );
  }
  if (cloud.apiKey) {
    process.env.ELIZAOS_CLOUD_API_KEY = cloud.apiKey;
  }
  if (cloud.baseUrl) {
    process.env.ELIZAOS_CLOUD_BASE_URL = cloud.baseUrl;
  }

  // Propagate model names so the cloud plugin picks them up.  Falls back to
  // sensible defaults when cloud is enabled but no explicit selection exists.
  const models = (config as Record<string, unknown>).models as
    | { small?: string; large?: string }
    | undefined;
  if (effectivelyEnabled) {
    const small = models?.small || "openai/gpt-5-mini";
    const large = models?.large || "anthropic/claude-sonnet-4.5";
    process.env.SMALL_MODEL = small;
    process.env.LARGE_MODEL = large;
    if (!process.env.ELIZAOS_CLOUD_SMALL_MODEL) {
      process.env.ELIZAOS_CLOUD_SMALL_MODEL = small;
    }
    if (!process.env.ELIZAOS_CLOUD_LARGE_MODEL) {
      process.env.ELIZAOS_CLOUD_LARGE_MODEL = large;
    }
  }
}

/**
 * Translate `config.database` into the environment variables that
 * `@elizaos/plugin-sql` reads at init time (`POSTGRES_URL`, `PGLITE_DATA_DIR`).
 *
 * When the provider is "postgres", we build a connection string from the
 * credentials (or use the explicit `connectionString` field) and set
 * `POSTGRES_URL`. When the provider is "pglite" (the default), we only
 * set `PGLITE_DATA_DIR` if a custom directory was configured and remove
 * any stale `POSTGRES_URL` so the plugin falls through to PGLite.
 */
/** @internal Exported for testing. */
export function applyX402ConfigToEnv(config: MilaidyConfig): void {
  const x402 = (config as Record<string, unknown>).x402 as
    | { enabled?: boolean; apiKey?: string; baseUrl?: string }
    | undefined;
  if (!x402?.enabled) return;
  if (!process.env.X402_ENABLED) process.env.X402_ENABLED = "true";
  if (x402.apiKey && !process.env.X402_API_KEY)
    process.env.X402_API_KEY = x402.apiKey;
  if (x402.baseUrl && !process.env.X402_BASE_URL)
    process.env.X402_BASE_URL = x402.baseUrl;
}

/** @internal Exported for testing. */
export function applyDatabaseConfigToEnv(config: MilaidyConfig): void {
  const db = config.database;
  if (!db) return;

  if (db.provider === "postgres" && db.postgres) {
    const pg = db.postgres;
    let url = pg.connectionString;
    if (!url) {
      const host = pg.host ?? "localhost";
      const port = pg.port ?? 5432;
      const user = encodeURIComponent(pg.user ?? "postgres");
      const password = pg.password ? encodeURIComponent(pg.password) : "";
      const database = pg.database ?? "postgres";
      const auth = password ? `${user}:${password}` : user;
      const sslParam = pg.ssl ? "?sslmode=require" : "";
      url = `postgresql://${auth}@${host}:${port}/${database}${sslParam}`;
    }
    process.env.POSTGRES_URL = url;
    // Clear PGLite dir so plugin-sql does not fall back to PGLite
    delete process.env.PGLITE_DATA_DIR;
  } else {
    // PGLite mode (default): ensure no leftover POSTGRES_URL
    delete process.env.POSTGRES_URL;
    if (db.pglite?.dataDir) {
      process.env.PGLITE_DATA_DIR = db.pglite.dataDir;
    }
  }
}
