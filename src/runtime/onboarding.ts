import process from "node:process";
import * as clack from "@clack/prompts";
import { cloudLogin } from "../cloud/auth.js";
import { type MilaidyConfig, saveMilaidyConfig } from "../config/config.js";
import type { AgentConfig } from "../config/types.agents.js";
import { STYLE_PRESETS } from "../onboarding-presets.js";
import { pickRandomNames } from "./onboarding-names.js";

/** Extract a human-readable error message from an unknown thrown value. */
function formatError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Cancel the onboarding flow and exit cleanly.
 * Extracted to avoid duplicating the cancel+exit pattern.
 */
function cancelOnboarding(): never {
  clack.cancel("Maybe next time!");
  process.exit(0);
}

/**
 * Detect whether this is the first run (no agent name configured)
 * and run the onboarding flow:
 *
 *   1. Welcome banner
 *   2. Name selector (4 random + Custom)
 *   3. Catchphrase / writing-style selector
 *   4. Persist agent name to `agents.list[0]` in config
 *
 * Character personality (bio, system prompt, style) is stored in the
 * database at runtime — only the agent name lives in config.
 *
 * Subsequent runs skip this entirely.
 */
export async function runFirstTimeSetup(
  config: MilaidyConfig,
): Promise<MilaidyConfig> {
  const agentEntry = config.agents?.list?.[0];
  const hasName = Boolean(agentEntry?.name || config.ui?.assistant?.name);
  if (hasName) return config;

  // Only prompt when stdin is a TTY (interactive terminal)
  if (!process.stdin.isTTY) return config;

  // ── Step 1: Welcome ────────────────────────────────────────────────────
  clack.intro("WELCOME TO MILAIDY!");

  // ── Step 1b: Where to run? ────────────────────────────────────────────
  const runMode = await clack.select({
    message: "Where do you want to run your agent?",
    options: [
      {
        value: "local",
        label: "On this machine (local)",
        hint: "requires an AI provider API key",
      },
      {
        value: "cloud",
        label: "In the cloud (Eliza Cloud)",
        hint: "free credits to start",
      },
    ],
  });

  if (clack.isCancel(runMode)) cancelOnboarding();

  let _cloudApiKey: string | undefined;

  if (runMode === "cloud") {
    const cloudBaseUrl = config.cloud?.baseUrl ?? "https://www.elizacloud.ai";

    clack.log.message("Opening your browser to log in to Eliza Cloud...");

    const loginResult = await cloudLogin({
      baseUrl: cloudBaseUrl,
      onBrowserUrl: (url) => {
        // Try to open the browser automatically; fall back to showing URL
        import("node:child_process")
          .then((cp) => {
            // Validate URL protocol to prevent shell injection via crafted
            // cloud.baseUrl values containing shell metacharacters.
            let safeUrl: string;
            try {
              const parsed = new URL(url);
              if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
                throw new Error("Invalid protocol");
              }
              safeUrl = parsed.href;
            } catch {
              clack.log.message(`Open this URL in your browser:\n  ${url}`);
              return;
            }

            // Use execFile (not exec) to avoid shell interpretation.
            // On Windows, "start" is a cmd built-in so we invoke via cmd.exe.
            const child =
              process.platform === "win32"
                ? cp.execFile("cmd", ["/c", "start", "", safeUrl])
                : cp.execFile(
                    process.platform === "darwin" ? "open" : "xdg-open",
                    [safeUrl],
                  );
            // Handle missing binary (e.g. xdg-open on minimal Linux) to
            // avoid an unhandled error crash — fall back to printing the URL.
            child.on("error", () => {
              clack.log.message(`Open this URL in your browser:\n  ${safeUrl}`);
            });
          })
          .catch(() => {
            clack.log.message(`Open this URL in your browser:\n  ${url}`);
          });
      },
      onPollStatus: (status) => {
        if (status === "pending") {
          // Spinner is handled by clack; nothing extra needed
        }
      },
    });

    _cloudApiKey = loginResult.apiKey;
    clack.log.success("Logged in to Eliza Cloud!");
  }

  // ── Step 2: Name ───────────────────────────────────────────────────────
  const randomNames = pickRandomNames(4);

  const nameChoice = await clack.select({
    message: "♡♡milaidy♡♡: Hey there, I'm.... err, what was my name again?",
    options: [
      ...randomNames.map((n) => ({ value: n, label: n })),
      { value: "_custom_", label: "Custom...", hint: "type your own" },
    ],
  });

  if (clack.isCancel(nameChoice)) cancelOnboarding();

  let name: string;

  if (nameChoice === "_custom_") {
    const customName = await clack.text({
      message: "OK, what should I be called?",
      placeholder: "Milaidy",
    });

    if (clack.isCancel(customName)) cancelOnboarding();

    name = customName.trim() || "Milaidy";
  } else {
    name = nameChoice;
  }

  clack.log.message(`♡♡${name}♡♡: Oh that's right, I'm ${name}!`);

  // ── Step 3: Catchphrase / writing style ────────────────────────────────
  const styleChoice = await clack.select({
    message: `${name}: Now... how do I like to talk again?`,
    options: STYLE_PRESETS.map((preset) => ({
      value: preset.catchphrase,
      label: preset.catchphrase,
      hint: preset.hint,
    })),
  });

  if (clack.isCancel(styleChoice)) cancelOnboarding();

  const chosenTemplate = STYLE_PRESETS.find(
    (p) => p.catchphrase === styleChoice,
  );

  // ── Step 4: Model provider ───────────────────────────────────────────────
  // Skip provider selection in cloud mode — Eliza Cloud handles inference.
  // Check whether an API key is already set in the environment (from .env or
  // shell).  If none is found, ask the user to pick a provider and enter a key.
  const PROVIDER_OPTIONS = [
    {
      id: "anthropic",
      label: "Anthropic (Claude)",
      envKey: "ANTHROPIC_API_KEY",
      detectKeys: ["ANTHROPIC_API_KEY"],
      hint: "sk-ant-...",
    },
    {
      id: "openai",
      label: "OpenAI (GPT)",
      envKey: "OPENAI_API_KEY",
      detectKeys: ["OPENAI_API_KEY"],
      hint: "sk-...",
    },
    {
      id: "openrouter",
      label: "OpenRouter",
      envKey: "OPENROUTER_API_KEY",
      detectKeys: ["OPENROUTER_API_KEY"],
      hint: "sk-or-...",
    },
    {
      id: "vercel-ai-gateway",
      label: "Vercel AI Gateway",
      envKey: "AI_GATEWAY_API_KEY",
      detectKeys: ["AI_GATEWAY_API_KEY", "AIGATEWAY_API_KEY"],
      hint: "aigw_...",
    },
    {
      id: "gemini",
      label: "Google Gemini",
      envKey: "GOOGLE_API_KEY",
      detectKeys: ["GOOGLE_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY"],
      hint: "AI...",
    },
    {
      id: "grok",
      label: "xAI (Grok)",
      envKey: "XAI_API_KEY",
      detectKeys: ["XAI_API_KEY"],
      hint: "xai-...",
    },
    {
      id: "groq",
      label: "Groq",
      envKey: "GROQ_API_KEY",
      detectKeys: ["GROQ_API_KEY"],
      hint: "gsk_...",
    },
    {
      id: "deepseek",
      label: "DeepSeek",
      envKey: "DEEPSEEK_API_KEY",
      detectKeys: ["DEEPSEEK_API_KEY"],
      hint: "sk-...",
    },
    {
      id: "mistral",
      label: "Mistral",
      envKey: "MISTRAL_API_KEY",
      detectKeys: ["MISTRAL_API_KEY"],
      hint: "",
    },
    {
      id: "together",
      label: "Together AI",
      envKey: "TOGETHER_API_KEY",
      detectKeys: ["TOGETHER_API_KEY"],
      hint: "",
    },
    {
      id: "ollama",
      label: "Ollama (local, free)",
      envKey: "OLLAMA_BASE_URL",
      detectKeys: ["OLLAMA_BASE_URL"],
      hint: "http://localhost:11434",
    },
  ] as const;

  // Detect if any provider key is already configured
  const detectedProvider = PROVIDER_OPTIONS.find((p) =>
    p.detectKeys.some((key) => process.env[key]?.trim()),
  );

  let providerEnvKey: string | undefined;
  let providerApiKey: string | undefined;

  // In cloud mode, skip provider selection entirely.
  if (runMode === "cloud") {
    clack.log.message("AI inference will be handled by Eliza Cloud.");
  } else if (detectedProvider) {
    clack.log.success(
      `Found existing ${detectedProvider.label} key in environment (${detectedProvider.envKey})`,
    );
  } else {
    const providerChoice = await clack.select({
      message: `${name}: One more thing — which AI provider should I use?`,
      options: [
        ...PROVIDER_OPTIONS.map((p) => ({
          value: p.id,
          label: p.label,
          hint: p.id === "ollama" ? "no API key needed" : undefined,
        })),
        {
          value: "_skip_",
          label: "Skip for now",
          hint: "set an API key later via env or config",
        },
      ],
    });

    if (clack.isCancel(providerChoice)) cancelOnboarding();

    if (providerChoice !== "_skip_") {
      const chosen = PROVIDER_OPTIONS.find((p) => p.id === providerChoice);
      if (chosen) {
        providerEnvKey = chosen.envKey;

        if (chosen.id === "ollama") {
          // Ollama just needs a base URL, default to localhost
          const ollamaUrl = await clack.text({
            message: "Ollama base URL:",
            placeholder: "http://localhost:11434",
            defaultValue: "http://localhost:11434",
          });

          if (clack.isCancel(ollamaUrl)) cancelOnboarding();

          providerApiKey = ollamaUrl.trim() || "http://localhost:11434";
        } else {
          const apiKeyInput = await clack.password({
            message: `Paste your ${chosen.label} API key:`,
          });

          if (clack.isCancel(apiKeyInput)) cancelOnboarding();

          providerApiKey = apiKeyInput.trim();
        }
      }
    }
  }

  // ── Step 5: Wallet setup ───────────────────────────────────────────────
  // Offer to generate or import wallets for EVM and Solana. Keys are
  // stored in config.env and process.env, making them available to
  // plugins at runtime.
  const { generateWalletKeys, importWallet } = await import("../api/wallet.js");

  const hasEvmKey = Boolean(process.env.EVM_PRIVATE_KEY?.trim());
  const hasSolKey = Boolean(process.env.SOLANA_PRIVATE_KEY?.trim());

  if (!hasEvmKey || !hasSolKey) {
    const walletAction = await clack.select({
      message: `${name}: Do you want me to set up crypto wallets? (for trading, NFTs, DeFi)`,
      options: [
        {
          value: "generate",
          label: "Generate new wallets",
          hint: "creates fresh EVM + Solana keypairs",
        },
        {
          value: "import",
          label: "Import existing wallets",
          hint: "paste your private keys",
        },
        {
          value: "skip",
          label: "Skip for now",
          hint: "wallets can be added later",
        },
      ],
    });

    if (clack.isCancel(walletAction)) cancelOnboarding();

    if (walletAction === "generate") {
      const keys = generateWalletKeys();

      if (!hasEvmKey) {
        process.env.EVM_PRIVATE_KEY = keys.evmPrivateKey;
        clack.log.success(`Generated EVM wallet: ${keys.evmAddress}`);
      }
      if (!hasSolKey) {
        process.env.SOLANA_PRIVATE_KEY = keys.solanaPrivateKey;
        clack.log.success(`Generated Solana wallet: ${keys.solanaAddress}`);
      }
    } else if (walletAction === "import") {
      // EVM import
      if (!hasEvmKey) {
        const evmKeyInput = await clack.password({
          message: "Paste your EVM private key (0x... hex, or skip):",
        });

        if (!clack.isCancel(evmKeyInput) && evmKeyInput.trim()) {
          const result = importWallet("evm", evmKeyInput.trim());
          if (result.success) {
            clack.log.success(`Imported EVM wallet: ${result.address}`);
          } else {
            clack.log.warn(`EVM import failed: ${result.error}`);
          }
        }
      }

      // Solana import
      if (!hasSolKey) {
        const solKeyInput = await clack.password({
          message: "Paste your Solana private key (base58, or skip):",
        });

        if (!clack.isCancel(solKeyInput) && solKeyInput.trim()) {
          const result = importWallet("solana", solKeyInput.trim());
          if (result.success) {
            clack.log.success(`Imported Solana wallet: ${result.address}`);
          } else {
            clack.log.warn(`Solana import failed: ${result.error}`);
          }
        }
      }
    }
    // "skip" — do nothing
  }

  // ── Step 6: Skills Marketplace API key ──────────────────────────────────
  const hasSkillsmpKey = Boolean(process.env.SKILLSMP_API_KEY?.trim());

  if (!hasSkillsmpKey) {
    const skillsmpAction = await clack.select({
      message: `${name}: Want to connect to the Skills Marketplace? (https://skillsmp.com)`,
      options: [
        {
          value: "enter",
          label: "Enter API key",
          hint: "enables browsing & installing skills",
        },
        {
          value: "skip",
          label: "Skip for now",
          hint: "you can add it later via env or config",
        },
      ],
    });

    if (clack.isCancel(skillsmpAction)) cancelOnboarding();

    if (skillsmpAction === "enter") {
      const skillsmpKeyInput = await clack.password({
        message: "Paste your skillsmp.com API key:",
      });

      if (!clack.isCancel(skillsmpKeyInput) && skillsmpKeyInput.trim()) {
        process.env.SKILLSMP_API_KEY = skillsmpKeyInput.trim();
        clack.log.success("Skills Marketplace API key saved!");
      }
    }
  }

  // ── Step 7: Persist agent name + style + provider to config ─────────────
  // Save the agent name and chosen personality template into config so that
  // the same character data is used regardless of whether the user onboarded
  // via CLI or GUI.  This ensures full parity between onboarding surfaces.
  const existingList: AgentConfig[] = config.agents?.list ?? [];
  const mainEntry: AgentConfig = existingList[0] ?? {
    id: "main",
    default: true,
  };
  const agentConfigEntry: AgentConfig = { ...mainEntry, name };

  // Apply the chosen style template to the agent config entry so the
  // personality is persisted — not just the name.
  if (chosenTemplate) {
    agentConfigEntry.bio = chosenTemplate.bio;
    agentConfigEntry.system = chosenTemplate.system;
    agentConfigEntry.style = chosenTemplate.style;
    agentConfigEntry.adjectives = chosenTemplate.adjectives;
    agentConfigEntry.topics = chosenTemplate.topics;
    agentConfigEntry.postExamples = chosenTemplate.postExamples;
    agentConfigEntry.messageExamples = chosenTemplate.messageExamples;
  }

  const updatedList: AgentConfig[] = [
    agentConfigEntry,
    ...existingList.slice(1),
  ];

  const updated: MilaidyConfig = {
    ...config,
    agents: {
      ...config.agents,
      list: updatedList,
    },
  };

  // Persist the provider API key and wallet keys in config.env so they
  // survive restarts.  Initialise the env bucket once to avoid the
  // repeated `if (!updated.env)` pattern.
  if (!updated.env) updated.env = {};
  const envBucket = updated.env as Record<string, string>;

  if (providerEnvKey && providerApiKey) {
    envBucket[providerEnvKey] = providerApiKey;
    // Also set immediately in process.env for the current run
    process.env[providerEnvKey] = providerApiKey;
  }
  if (process.env.EVM_PRIVATE_KEY && !hasEvmKey) {
    envBucket.EVM_PRIVATE_KEY = process.env.EVM_PRIVATE_KEY;
  }
  if (process.env.SOLANA_PRIVATE_KEY && !hasSolKey) {
    envBucket.SOLANA_PRIVATE_KEY = process.env.SOLANA_PRIVATE_KEY;
  }
  if (process.env.SKILLSMP_API_KEY && !hasSkillsmpKey) {
    envBucket.SKILLSMP_API_KEY = process.env.SKILLSMP_API_KEY;
  }

  try {
    saveMilaidyConfig(updated);
  } catch (err) {
    // Non-fatal: the agent can still start, but choices won't persist.
    clack.log.warn(`Could not save config: ${formatError(err)}`);
  }
  clack.log.message(`${name}: ${styleChoice} Alright, that's me.`);
  clack.outro("Let's get started!");

  return updated;
}
