import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { type AgentRuntime, logger } from "@elizaos/core";
import {
  type ServerState,
  type RequestContext,
  type AutonomyServiceLike,
} from "../types.js";
import { readJsonBody, readRawBody, json, error } from "../utils.js";
import {
  configFileExists,
  saveMilaidyConfig,
} from "../../config/config.js";
import { resolveStateDir } from "../../config/paths.js";
import { resolveDefaultAgentWorkspaceDir } from "../../providers/workspace.js";
import {
  AgentExportError,
  estimateExportSize,
  exportAgent,
  importAgent,
} from "../../services/agent-export.js";
import { generateWalletKeys } from "../wallet.js";
import { STYLE_PRESETS } from "../../onboarding-presets.js";
import { pickRandomNames } from "../../runtime/onboarding-names.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Helper to retrieve the AutonomyService from a runtime (may be null). */
function getAutonomySvc(
  runtime: AgentRuntime | null,
): AutonomyServiceLike | null {
  if (!runtime) return null;
  return runtime.getService("AUTONOMY") as AutonomyServiceLike | null;
}

const MAX_IMPORT_BYTES = 512 * 1_048_576; // 512 MB for agent imports

function getProviderOptions(): Array<{
  id: string;
  name: string;
  envKey: string | null;
  pluginName: string;
  keyPrefix: string | null;
  description: string;
}> {
  return [
    {
      id: "elizacloud",
      name: "Eliza Cloud",
      envKey: null,
      pluginName: "@elizaos/plugin-elizacloud",
      keyPrefix: null,
      description: "Free credits, best option to try the app.",
    },
    {
      id: "anthropic-subscription",
      name: "Anthropic Subscription",
      envKey: null,
      pluginName: "@elizaos/plugin-anthropic",
      keyPrefix: null,
      description:
        "Use your $20-200/mo Claude subscription via OAuth or setup token.",
    },
    {
      id: "openai-subscription",
      name: "OpenAI Subscription",
      envKey: null,
      pluginName: "@elizaos/plugin-openai",
      keyPrefix: null,
      description: "Use your $20-200/mo ChatGPT subscription via OAuth.",
    },
    {
      id: "anthropic",
      name: "Anthropic (API Key)",
      envKey: "ANTHROPIC_API_KEY",
      pluginName: "@elizaos/plugin-anthropic",
      keyPrefix: "sk-ant-",
      description: "Claude models via API key.",
    },
    {
      id: "openai",
      name: "OpenAI (API Key)",
      envKey: "OPENAI_API_KEY",
      pluginName: "@elizaos/plugin-openai",
      keyPrefix: "sk-",
      description: "GPT models via API key.",
    },
    {
      id: "openrouter",
      name: "OpenRouter",
      envKey: "OPENROUTER_API_KEY",
      pluginName: "@elizaos/plugin-openrouter",
      keyPrefix: "sk-or-",
      description: "Access multiple models via one API key.",
    },
    {
      id: "gemini",
      name: "Gemini",
      envKey: "GOOGLE_API_KEY",
      pluginName: "@elizaos/plugin-google-genai",
      keyPrefix: null,
      description: "Google's Gemini models.",
    },
    {
      id: "grok",
      name: "Grok",
      envKey: "XAI_API_KEY",
      pluginName: "@elizaos/plugin-xai",
      keyPrefix: "xai-",
      description: "xAI's Grok models.",
    },
    {
      id: "groq",
      name: "Groq",
      envKey: "GROQ_API_KEY",
      pluginName: "@elizaos/plugin-groq",
      keyPrefix: "gsk_",
      description: "Fast inference.",
    },
    {
      id: "deepseek",
      name: "DeepSeek",
      envKey: "DEEPSEEK_API_KEY",
      pluginName: "@elizaos/plugin-deepseek",
      keyPrefix: "sk-",
      description: "DeepSeek models.",
    },
    {
      id: "mistral",
      name: "Mistral",
      envKey: "MISTRAL_API_KEY",
      pluginName: "@elizaos/plugin-mistral",
      keyPrefix: null,
      description: "Mistral AI models.",
    },
    {
      id: "together",
      name: "Together AI",
      envKey: "TOGETHER_API_KEY",
      pluginName: "@elizaos/plugin-together",
      keyPrefix: null,
      description: "Open-source model hosting.",
    },
    {
      id: "ollama",
      name: "Ollama (local)",
      envKey: null,
      pluginName: "@elizaos/plugin-ollama",
      keyPrefix: null,
      description: "Local models, no API key needed.",
    },
    {
      id: "zai",
      name: "z.ai (GLM Coding Plan)",
      envKey: "ZAI_API_KEY",
      pluginName: "@homunculuslabs/plugin-zai",
      keyPrefix: null,
      description: "GLM models via z.ai Coding Plan.",
    },
  ];
}

function getCloudProviderOptions(): Array<{
  id: string;
  name: string;
  description: string;
}> {
  return [
    {
      id: "elizacloud",
      name: "Eliza Cloud",
      description:
        "Managed cloud infrastructure. Wallets, LLMs, and RPCs included.",
    },
  ];
}

function getModelOptions(): {
  small: Array<{
    id: string;
    name: string;
    provider: string;
    description: string;
  }>;
  large: Array<{
    id: string;
    name: string;
    provider: string;
    description: string;
  }>;
} {
  return {
    small: [
      {
        id: "openai/gpt-5-mini",
        name: "GPT-5 Mini",
        provider: "OpenAI",
        description: "Fast and affordable.",
      },
      {
        id: "openai/gpt-4o-mini",
        name: "GPT-4o Mini",
        provider: "OpenAI",
        description: "Compact multimodal model.",
      },
      {
        id: "anthropic/claude-sonnet-4",
        name: "Claude Sonnet 4",
        provider: "Anthropic",
        description: "Balanced speed and capability.",
      },
      {
        id: "google/gemini-2.5-flash-lite",
        name: "Gemini 2.5 Flash Lite",
        provider: "Google",
        description: "Fastest option.",
      },
      {
        id: "google/gemini-2.5-flash",
        name: "Gemini 2.5 Flash",
        provider: "Google",
        description: "Fast and smart.",
      },
      {
        id: "google/gemini-2.0-flash",
        name: "Gemini 2.0 Flash",
        provider: "Google",
        description: "Multimodal flash model.",
      },
      {
        id: "moonshotai/kimi-k2-turbo",
        name: "Kimi K2 Turbo",
        provider: "Moonshot AI",
        description: "Extra speed.",
      },
      {
        id: "deepseek/deepseek-v3.2-exp",
        name: "DeepSeek V3.2",
        provider: "DeepSeek",
        description: "Open and powerful.",
      },
    ],
    large: [
      {
        id: "anthropic/claude-sonnet-4.5",
        name: "Claude Sonnet 4.5",
        provider: "Anthropic",
        description: "Newest Claude. Excellent reasoning.",
      },
      {
        id: "anthropic/claude-opus-4.5",
        name: "Claude Opus 4.5",
        provider: "Anthropic",
        description: "Most capable Claude model.",
      },
      {
        id: "anthropic/claude-opus-4.1",
        name: "Claude Opus 4.1",
        provider: "Anthropic",
        description: "Deep reasoning powerhouse.",
      },
      {
        id: "anthropic/claude-sonnet-4",
        name: "Claude Sonnet 4",
        provider: "Anthropic",
        description: "Balanced performance.",
      },
      {
        id: "openai/gpt-5",
        name: "GPT-5",
        provider: "OpenAI",
        description: "Most capable OpenAI model.",
      },
      {
        id: "openai/gpt-4o",
        name: "GPT-4o",
        provider: "OpenAI",
        description: "Flagship multimodal model.",
      },
      {
        id: "google/gemini-3-pro-preview",
        name: "Gemini 3 Pro Preview",
        provider: "Google",
        description: "Advanced reasoning.",
      },
      {
        id: "google/gemini-2.5-pro",
        name: "Gemini 2.5 Pro",
        provider: "Google",
        description: "Strong multimodal reasoning.",
      },
      {
        id: "moonshotai/kimi-k2-0905",
        name: "Kimi K2",
        provider: "Moonshot AI",
        description: "Fast and capable.",
      },
      {
        id: "deepseek/deepseek-r1",
        name: "DeepSeek R1",
        provider: "DeepSeek",
        description: "Reasoning model.",
      },
    ],
  };
}

function getInventoryProviderOptions(): Array<{
  id: string;
  name: string;
  description: string;
  rpcProviders: Array<{
    id: string;
    name: string;
    description: string;
    envKey: string | null;
    requiresKey: boolean;
  }>;
}> {
  return [
    {
      id: "evm",
      name: "EVM",
      description: "Ethereum, Base, Arbitrum, Optimism, Polygon.",
      rpcProviders: [
        {
          id: "elizacloud",
          name: "Eliza Cloud",
          description: "Managed RPC. No setup needed.",
          envKey: null,
          requiresKey: false,
        },
        {
          id: "infura",
          name: "Infura",
          description: "Reliable EVM infrastructure.",
          envKey: "INFURA_API_KEY",
          requiresKey: true,
        },
        {
          id: "alchemy",
          name: "Alchemy",
          description: "Full-featured EVM data platform.",
          envKey: "ALCHEMY_API_KEY",
          requiresKey: true,
        },
        {
          id: "ankr",
          name: "Ankr",
          description: "Decentralized RPC provider.",
          envKey: "ANKR_API_KEY",
          requiresKey: true,
        },
      ],
    },
    {
      id: "solana",
      name: "Solana",
      description: "Solana mainnet tokens and NFTs.",
      rpcProviders: [
        {
          id: "elizacloud",
          name: "Eliza Cloud",
          description: "Managed RPC. No setup needed.",
          envKey: null,
          requiresKey: false,
        },
        {
          id: "helius",
          name: "Helius",
          description: "Solana-native data platform.",
          envKey: "HELIUS_API_KEY",
          requiresKey: true,
        },
      ],
    },
  ];
}

// ---------------------------------------------------------------------------
// Route Handler
// ---------------------------------------------------------------------------

export async function handleAgentRoute(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  pathname: string,
  method: string,
  state: ServerState,
  ctx?: RequestContext
): Promise<boolean> {
  // ── GET /api/status ─────────────────────────────────────────────────────
  if (method === "GET" && pathname === "/api/status") {
    const uptime = state.startedAt ? Date.now() - state.startedAt : undefined;

    // Cloud mode: report cloud connection status alongside local state
    const cloudProxy = state.cloudManager?.getProxy();
    const runMode = cloudProxy ? "cloud" : "local";
    const cloudStatus = state.cloudManager
      ? {
          connectionStatus: state.cloudManager.getStatus(),
          activeAgentId: state.cloudManager.getActiveAgentId(),
        }
      : undefined;

    json(res, {
      state: cloudProxy ? "running" : state.agentState,
      agentName: cloudProxy ? cloudProxy.agentName : state.agentName,
      model: cloudProxy ? "cloud" : state.model,
      uptime,
      startedAt: state.startedAt,
      runMode,
      cloud: cloudStatus,
    });
    return true;
  }

  // ── GET /api/onboarding/status ──────────────────────────────────────────
  if (method === "GET" && pathname === "/api/onboarding/status") {
    const complete = configFileExists() && Boolean(state.config.agents);
    json(res, { complete });
    return true;
  }

  // ── GET /api/onboarding/options ─────────────────────────────────────────
  if (method === "GET" && pathname === "/api/onboarding/options") {
    json(res, {
      names: pickRandomNames(5),
      styles: STYLE_PRESETS,
      providers: getProviderOptions(),
      cloudProviders: getCloudProviderOptions(),
      models: getModelOptions(),
      inventoryProviders: getInventoryProviderOptions(),
      sharedStyleRules: "Keep responses brief. Be helpful and concise.",
    });
    return true;
  }

  // ── POST /api/onboarding ────────────────────────────────────────────────
  if (method === "POST" && pathname === "/api/onboarding") {
    const body = await readJsonBody(req, res);
    if (!body) return true;

    // ── Validate required fields ──────────────────────────────────────────
    if (!body.name || typeof body.name !== "string" || !body.name.trim()) {
      error(res, "Missing or invalid agent name", 400);
      return true;
    }
    // Theme is UI-only (milady, haxor, qt314, etc.) — no server validation needed
    if (body.runMode && body.runMode !== "local" && body.runMode !== "cloud") {
      error(res, "Invalid runMode: must be 'local' or 'cloud'", 400);
      return true;
    }

    const config = state.config;

    if (!config.agents) config.agents = {};
    if (!config.agents.defaults) config.agents.defaults = {};
    config.agents.defaults.workspace = resolveDefaultAgentWorkspaceDir();

    if (!config.agents.list) config.agents.list = [];
    if (config.agents.list.length === 0) {
      config.agents.list.push({ id: "main", default: true });
    }
    const agent = config.agents.list[0];
    agent.name = (body.name as string).trim();
    agent.workspace = resolveDefaultAgentWorkspaceDir();
    if (body.bio) agent.bio = body.bio as string[];
    if (body.systemPrompt) agent.system = body.systemPrompt as string;
    if (body.style)
      agent.style = body.style as {
        all?: string[];
        chat?: string[];
        post?: string[];
      };
    if (body.adjectives) agent.adjectives = body.adjectives as string[];
    if (body.topics) agent.topics = body.topics as string[];
    if (body.postExamples) agent.postExamples = body.postExamples as string[];
    if (body.messageExamples)
      agent.messageExamples = body.messageExamples as Array<
        Array<{ user: string; content: { text: string } }>
      >;

    // ── Theme preference ──────────────────────────────────────────────────
    if (body.theme) {
      if (!config.ui) config.ui = {};
      config.ui.theme = body.theme as
        | "milady"
        | "qt314"
        | "web2000"
        | "programmer"
        | "haxor"
        | "psycho";
    }

    // ── Run mode & cloud configuration ────────────────────────────────────
    const runMode = (body.runMode as string) || "local";
    if (!config.cloud) config.cloud = {};
    config.cloud.enabled = runMode === "cloud";

    if (runMode === "cloud") {
      if (body.cloudProvider) {
        config.cloud.provider = body.cloudProvider as string;
      }
      // Always ensure model defaults when cloud is selected so the cloud
      // plugin has valid models to call even if the user didn't pick any.
      if (!config.models) config.models = {};
      config.models.small =
        (body.smallModel as string) ||
        config.models.small ||
        "openai/gpt-5-mini";
      config.models.large =
        (body.largeModel as string) ||
        config.models.large ||
        "anthropic/claude-sonnet-4.5";
    }

    // ── Local LLM provider ────────────────────────────────────────────────
    if (runMode === "local" && body.provider) {
      if (body.providerApiKey) {
        if (!config.env) config.env = {};
        const providerOpt = getProviderOptions().find(
          (p) => p.id === body.provider,
        );
        if (providerOpt?.envKey) {
          (config.env as Record<string, string>)[providerOpt.envKey] =
            body.providerApiKey as string;
          process.env[providerOpt.envKey] = body.providerApiKey as string;
        }
      }
    }

    // ── Subscription providers (no API key needed — uses OAuth) ──────────
    if (
      runMode === "local" &&
      (body.provider === "anthropic-subscription" ||
        body.provider === "openai-subscription")
    ) {
      if (!config.agents) config.agents = {};
      if (!config.agents.defaults) config.agents.defaults = {};
      (config.agents.defaults as Record<string, unknown>).subscriptionProvider =
        body.provider;
      logger.info(
        `[milaidy-api] Subscription provider selected: ${body.provider} — complete OAuth via /api/subscription/ endpoints`,
      );
    }

    // ── Connectors (Telegram, Discord, WhatsApp, Twilio, Blooio) ────────
    if (!config.connectors) config.connectors = {};
    if (
      body.telegramToken &&
      typeof body.telegramToken === "string" &&
      body.telegramToken.trim()
    ) {
      config.connectors.telegram = { botToken: body.telegramToken.trim() };
    }
    if (
      body.discordToken &&
      typeof body.discordToken === "string" &&
      body.discordToken.trim()
    ) {
      config.connectors.discord = { botToken: body.discordToken.trim() };
    }
    if (
      body.whatsappSessionPath &&
      typeof body.whatsappSessionPath === "string" &&
      body.whatsappSessionPath.trim()
    ) {
      config.connectors.whatsapp = {
        sessionPath: body.whatsappSessionPath.trim(),
      };
    }
    if (
      body.twilioAccountSid &&
      typeof body.twilioAccountSid === "string" &&
      body.twilioAccountSid.trim() &&
      body.twilioAuthToken &&
      typeof body.twilioAuthToken === "string" &&
      body.twilioAuthToken.trim()
    ) {
      if (!config.env) config.env = {};
      (config.env as Record<string, string>).TWILIO_ACCOUNT_SID = (
        body.twilioAccountSid as string
      ).trim();
      (config.env as Record<string, string>).TWILIO_AUTH_TOKEN = (
        body.twilioAuthToken as string
      ).trim();
      process.env.TWILIO_ACCOUNT_SID = (body.twilioAccountSid as string).trim();
      process.env.TWILIO_AUTH_TOKEN = (body.twilioAuthToken as string).trim();
      if (
        body.twilioPhoneNumber &&
        typeof body.twilioPhoneNumber === "string" &&
        body.twilioPhoneNumber.trim()
      ) {
        (config.env as Record<string, string>).TWILIO_PHONE_NUMBER = (
          body.twilioPhoneNumber as string
        ).trim();
        process.env.TWILIO_PHONE_NUMBER = (
          body.twilioPhoneNumber as string
        ).trim();
      }
    }
    if (
      body.blooioApiKey &&
      typeof body.blooioApiKey === "string" &&
      body.blooioApiKey.trim()
    ) {
      if (!config.env) config.env = {};
      (config.env as Record<string, string>).BLOOIO_API_KEY = (
        body.blooioApiKey as string
      ).trim();
      process.env.BLOOIO_API_KEY = (body.blooioApiKey as string).trim();
      if (
        body.blooioPhoneNumber &&
        typeof body.blooioPhoneNumber === "string" &&
        body.blooioPhoneNumber.trim()
      ) {
        (config.env as Record<string, string>).BLOOIO_PHONE_NUMBER = (
          body.blooioPhoneNumber as string
        ).trim();
        process.env.BLOOIO_PHONE_NUMBER = (
          body.blooioPhoneNumber as string
        ).trim();
      }
    }

    // ── Inventory / RPC providers ─────────────────────────────────────────
    if (Array.isArray(body.inventoryProviders)) {
      if (!config.env) config.env = {};
      const allInventory = getInventoryProviderOptions();
      for (const inv of body.inventoryProviders as Array<{
        chain: string;
        rpcProvider: string;
        rpcApiKey?: string;
      }>) {
        const chainDef = allInventory.find((ip) => ip.id === inv.chain);
        if (!chainDef) continue;
        const rpcDef = chainDef.rpcProviders.find(
          (rp) => rp.id === inv.rpcProvider,
        );
        if (rpcDef?.envKey && inv.rpcApiKey) {
          (config.env as Record<string, string>)[rpcDef.envKey] = inv.rpcApiKey;
          process.env[rpcDef.envKey] = inv.rpcApiKey;
        }
      }
    }

    // ── Generate wallet keys if not already present ───────────────────────
    if (!process.env.EVM_PRIVATE_KEY || !process.env.SOLANA_PRIVATE_KEY) {
      try {
        const walletKeys = generateWalletKeys();

        if (!process.env.EVM_PRIVATE_KEY) {
          if (!config.env) config.env = {};
          (config.env as Record<string, string>).EVM_PRIVATE_KEY =
            walletKeys.evmPrivateKey;
          process.env.EVM_PRIVATE_KEY = walletKeys.evmPrivateKey;
          logger.info(
            `[milaidy-api] Generated EVM wallet: ${walletKeys.evmAddress}`,
          );
        }

        if (!process.env.SOLANA_PRIVATE_KEY) {
          if (!config.env) config.env = {};
          (config.env as Record<string, string>).SOLANA_PRIVATE_KEY =
            walletKeys.solanaPrivateKey;
          process.env.SOLANA_PRIVATE_KEY = walletKeys.solanaPrivateKey;
          logger.info(
            `[milaidy-api] Generated Solana wallet: ${walletKeys.solanaAddress}`,
          );
        }
      } catch (err) {
        logger.warn(`[milaidy-api] Failed to generate wallet keys: ${err}`);
      }
    }

    state.config = config;
    state.agentName = (body.name as string) ?? state.agentName;
    try {
      saveMilaidyConfig(config);
    } catch (err) {
      logger.error(
        `[milaidy-api] Failed to save config after onboarding: ${err}`,
      );
      error(res, "Failed to save configuration", 500);
      return true;
    }
    logger.info(
      `[milaidy-api] Onboarding complete for agent "${body.name}" (mode: ${(body.runMode as string) || "local"})`,
    );
    json(res, { ok: true });
    return true;
  }

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

    // Enable the autonomy task — the core TaskService will pick it up
    // and fire the first tick immediately (updatedAt starts at 0).
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
    // Re-enable the autonomy task — first tick fires immediately
    // because the new task is created with updatedAt: 0.
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

    // Reject if already mid-restart to prevent overlapping restarts.
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
        // Restore previous state instead of permanently stuck in "error"
        state.agentState = previousState;
        error(
          res,
          "Restart handler returned null — runtime failed to re-initialize",
          500,
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Restore previous state so the UI can retry
      state.agentState = previousState;
      error(res, `Restart failed: ${msg}`, 500);
    }
    return true;
  }

  // ── POST /api/agent/reset ──────────────────────────────────────────────
  // Wipe config, workspace (memory), and return to onboarding.
  if (method === "POST" && pathname === "/api/agent/reset") {
    try {
      // 1. Stop the runtime if it's running
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

      // 2. Delete the state directory (~/.milaidy/) which contains
      //    config, workspace, memory, oauth tokens, etc.
      const stateDir = resolveStateDir();

      // Safety: validate the resolved path before recursive deletion.
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

      // 3. Reset server state
      state.agentState = "stopped";
      state.agentName = "Milaidy";
      state.model = undefined;
      state.startedAt = undefined;
      state.config = {} as any; // Using any cast as config needs to be reset
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
  // Export the entire agent as a password-encrypted binary file.
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
