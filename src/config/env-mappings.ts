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
export const CHANNEL_ENV_MAP: Readonly<
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
