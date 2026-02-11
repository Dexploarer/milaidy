import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { MilaidyConfig } from "../config/config.js";
import {
  applyCloudConfigToEnv,
  applyConnectorSecretsToEnv,
  applyDatabaseConfigToEnv,
  applyX402ConfigToEnv,
} from "./env-setup.js";
import process from "node:process";

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/** Save and restore a set of env keys around each test. */
function envSnapshot(keys: string[]): {
  save: () => void;
  restore: () => void;
} {
  const saved = new Map<string, string | undefined>();
  return {
    save() {
      for (const k of keys) saved.set(k, process.env[k]);
    },
    restore() {
      for (const [k, v] of saved) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    },
  };
}

// ---------------------------------------------------------------------------
// applyConnectorSecretsToEnv
// ---------------------------------------------------------------------------

describe("applyConnectorSecretsToEnv", () => {
  const envKeys = [
    "DISCORD_BOT_TOKEN",
    "TELEGRAM_BOT_TOKEN",
    "SLACK_BOT_TOKEN",
    "SLACK_APP_TOKEN",
    "SLACK_USER_TOKEN",
    "SIGNAL_ACCOUNT",
    "MSTEAMS_APP_ID",
    "MSTEAMS_APP_PASSWORD",
    "MATTERMOST_BOT_TOKEN",
    "MATTERMOST_BASE_URL",
    "GOOGLE_CHAT_SERVICE_ACCOUNT_KEY",
  ];
  const snap = envSnapshot(envKeys);
  beforeEach(() => {
    snap.save();
    for (const k of envKeys) delete process.env[k];
  });
  afterEach(() => snap.restore());

  it("copies Discord token from config to env", () => {
    const config = {
      connectors: { discord: { token: "discord-tok-123" } },
    } as MilaidyConfig;
    applyConnectorSecretsToEnv(config);
    expect(process.env.DISCORD_BOT_TOKEN).toBe("discord-tok-123");
  });

  it("copies Telegram botToken from config to env", () => {
    const config = {
      connectors: { telegram: { botToken: "tg-tok-456" } },
    } as MilaidyConfig;
    applyConnectorSecretsToEnv(config);
    expect(process.env.TELEGRAM_BOT_TOKEN).toBe("tg-tok-456");
  });

  it("copies all Slack tokens from config to env", () => {
    const config = {
      connectors: {
        slack: { botToken: "xoxb-1", appToken: "xapp-1", userToken: "xoxp-1" },
      },
    } as MilaidyConfig;
    applyConnectorSecretsToEnv(config);
    expect(process.env.SLACK_BOT_TOKEN).toBe("xoxb-1");
    expect(process.env.SLACK_APP_TOKEN).toBe("xapp-1");
    expect(process.env.SLACK_USER_TOKEN).toBe("xoxp-1");
  });

  it("does not overwrite existing env values", () => {
    process.env.TELEGRAM_BOT_TOKEN = "already-set";
    const config = {
      connectors: { telegram: { botToken: "new-tok" } },
    } as MilaidyConfig;
    applyConnectorSecretsToEnv(config);
    expect(process.env.TELEGRAM_BOT_TOKEN).toBe("already-set");
  });

  it("skips empty or whitespace-only values", () => {
    const config = {
      connectors: { discord: { token: "  " } },
    } as MilaidyConfig;
    applyConnectorSecretsToEnv(config);
    expect(process.env.DISCORD_BOT_TOKEN).toBeUndefined();
  });

  it("handles missing connectors gracefully", () => {
    expect(() => applyConnectorSecretsToEnv({} as MilaidyConfig)).not.toThrow();
  });

  it("handles unknown connector names gracefully", () => {
    const config = {
      connectors: { unknownConnector: { token: "tok" } },
    } as unknown as MilaidyConfig;
    expect(() => applyConnectorSecretsToEnv(config)).not.toThrow();
  });

  it("supports legacy channels key for backward compat", () => {
    const config = {
      channels: { telegram: { botToken: "legacy-tg-tok" } },
    } as MilaidyConfig;
    applyConnectorSecretsToEnv(config);
    expect(process.env.TELEGRAM_BOT_TOKEN).toBe("legacy-tg-tok");
  });
});

// ---------------------------------------------------------------------------
// applyCloudConfigToEnv
// ---------------------------------------------------------------------------

describe("applyCloudConfigToEnv", () => {
  const envKeys = [
    "ELIZAOS_CLOUD_ENABLED",
    "ELIZAOS_CLOUD_API_KEY",
    "ELIZAOS_CLOUD_BASE_URL",
    "SMALL_MODEL",
    "LARGE_MODEL",
    "ELIZAOS_CLOUD_SMALL_MODEL",
    "ELIZAOS_CLOUD_LARGE_MODEL",
  ];
  const snap = envSnapshot(envKeys);
  beforeEach(() => {
    snap.save();
    for (const k of envKeys) delete process.env[k];
  });
  afterEach(() => snap.restore());

  it("sets cloud env vars from config", () => {
    const config = {
      cloud: { enabled: true, apiKey: "ck-123", baseUrl: "https://cloud.test" },
    } as MilaidyConfig;
    applyCloudConfigToEnv(config);
    expect(process.env.ELIZAOS_CLOUD_ENABLED).toBe("true");
    expect(process.env.ELIZAOS_CLOUD_API_KEY).toBe("ck-123");
    expect(process.env.ELIZAOS_CLOUD_BASE_URL).toBe("https://cloud.test");
  });

  it("overwrites stale env values with fresh config (hot-reload safety)", () => {
    process.env.ELIZAOS_CLOUD_API_KEY = "old-key";
    const config = { cloud: { apiKey: "new-key" } } as MilaidyConfig;
    applyCloudConfigToEnv(config);
    expect(process.env.ELIZAOS_CLOUD_API_KEY).toBe("new-key");
  });

  it("handles missing cloud config gracefully", () => {
    expect(() => applyCloudConfigToEnv({} as MilaidyConfig)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// applyX402ConfigToEnv
// ---------------------------------------------------------------------------

describe("applyX402ConfigToEnv", () => {
  const envKeys = ["X402_ENABLED", "X402_API_KEY", "X402_BASE_URL"];
  const snap = envSnapshot(envKeys);
  beforeEach(() => {
    snap.save();
    for (const k of envKeys) delete process.env[k];
  });
  afterEach(() => snap.restore());

  it("sets x402 env vars when enabled", () => {
    const config = {
      x402: { enabled: true, apiKey: "x402-key", baseUrl: "https://x402.test" },
    } as unknown as MilaidyConfig;
    applyX402ConfigToEnv(config);
    expect(process.env.X402_ENABLED).toBe("true");
    expect(process.env.X402_API_KEY).toBe("x402-key");
    expect(process.env.X402_BASE_URL).toBe("https://x402.test");
  });

  it("does nothing when x402 is not enabled", () => {
    const config = {
      x402: { enabled: false, apiKey: "key" },
    } as unknown as MilaidyConfig;
    applyX402ConfigToEnv(config);
    expect(process.env.X402_ENABLED).toBeUndefined();
    expect(process.env.X402_API_KEY).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// applyDatabaseConfigToEnv
// ---------------------------------------------------------------------------

describe("applyDatabaseConfigToEnv", () => {
  const envKeys = ["POSTGRES_URL", "PGLITE_DATA_DIR"];
  const snap = envSnapshot(envKeys);
  beforeEach(() => {
    snap.save();
    for (const k of envKeys) delete process.env[k];
  });
  afterEach(() => snap.restore());

  it("sets POSTGRES_URL for postgres provider", () => {
    const config = {
      database: {
        provider: "postgres",
        postgres: {
          host: "localhost",
          port: 5432,
          user: "user",
          password: "pw",
          database: "db",
        },
      },
    } as MilaidyConfig;
    applyDatabaseConfigToEnv(config);
    expect(process.env.POSTGRES_URL).toBe(
      "postgresql://user:pw@localhost:5432/db",
    );
    expect(process.env.PGLITE_DATA_DIR).toBeUndefined();
  });

  it("uses connectionString if provided for postgres", () => {
    const config = {
      database: {
        provider: "postgres",
        postgres: {
          connectionString: "postgresql://custom:url",
        },
      },
    } as MilaidyConfig;
    applyDatabaseConfigToEnv(config);
    expect(process.env.POSTGRES_URL).toBe("postgresql://custom:url");
  });

  it("clears POSTGRES_URL and sets PGLITE_DATA_DIR for pglite provider", () => {
    process.env.POSTGRES_URL = "old-url";
    const config = {
      database: {
        provider: "pglite",
        pglite: { dataDir: "/tmp/data" },
      },
    } as MilaidyConfig;
    applyDatabaseConfigToEnv(config);
    expect(process.env.POSTGRES_URL).toBeUndefined();
    expect(process.env.PGLITE_DATA_DIR).toBe("/tmp/data");
  });
});
