/**
 * ElizaOS runtime entry point for Milaidy.
 *
 * Starts the ElizaOS agent runtime with Milaidy's plugin configuration.
 * Can be run directly via: node --import tsx src/runtime/eliza.ts
 * Or via the CLI: milaidy start
 *
 * @module eliza
 */
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import * as readline from "node:readline";
import { pathToFileURL } from "node:url";
import {
  AgentRuntime,
  ChannelType,
  createMessageMemory,
  logger,
  stringToUuid,
  type UUID,
} from "@elizaos/core";
import {
  debugLogResolvedContext,
  validateRuntimeContext,
} from "../api/plugin-validation.js";
import { loadMilaidyConfig, type MilaidyConfig } from "../config/config.js";
import { resolveStateDir } from "../config/paths.js";
import {
  createHookEvent,
  type LoadHooksOptions,
  loadHooks,
  triggerHook,
} from "../hooks/index.js";
import {
  ensureAgentWorkspace,
  resolveDefaultAgentWorkspaceDir,
} from "../providers/workspace.js";
import {
  applyCloudConfigToEnv,
  applyConnectorSecretsToEnv,
  applyDatabaseConfigToEnv,
  applyX402ConfigToEnv,
  buildCharacterFromConfig,
  resolvePrimaryModel,
} from "./config-mapping.js";
import { createMilaidyPlugin } from "./milaidy-plugin.js";
import { runFirstTimeSetup } from "./onboarding.js";
import { createPhettaCompanionPlugin, resolvePhettaCompanionOptionsFromEnv } from "./phetta-companion-plugin.js";
import { CUSTOM_PLUGINS_DIRNAME, resolvePlugins } from "./plugins/resolution.js";
import { formatError } from "./utils.js";

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/** Options accepted by {@link startEliza}. */
export interface StartElizaOptions {
  /**
   * When true, skip the interactive CLI chat loop and return the
   * initialised {@link AgentRuntime} so it can be wired into the API
   * server (used by `dev-server.ts`).
   */
  headless?: boolean;
}

/**
 * Start the ElizaOS runtime with Milaidy's configuration.
 *
 * In headless mode the runtime is returned instead of entering the
 * interactive readline loop.
 */
export async function startEliza(
  opts?: StartElizaOptions,
): Promise<AgentRuntime | undefined> {
  // Start buffering logs early so startup messages appear in the UI log viewer
  const { captureEarlyLogs } = await import("../api/server.js");
  captureEarlyLogs();

  // 1. Load Milaidy config from ~/.milaidy/milaidy.json
  let config: MilaidyConfig;
  try {
    config = loadMilaidyConfig();
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      logger.warn("[milaidy] No config found, using defaults");
      // All MilaidyConfig fields are optional, so an empty object is
      // structurally valid. The `as` cast is safe here.
      config = {} as MilaidyConfig;
    } else {
      throw err;
    }
  }

  // 1b. First-run onboarding — ask for agent name if not configured.
  //     In headless mode (GUI) the onboarding is handled by the web UI,
  //     so we skip the interactive CLI prompt and let the runtime start
  //     with defaults.  The GUI will restart the agent after onboarding.
  if (!opts?.headless) {
    config = await runFirstTimeSetup(config);
  }

  // 1c. Apply logging level from config to process.env so the global
  //     @elizaos/core logger (used by plugins) respects it.
  //     Default to "info" so runtime activity is visible (AgentRuntime
  //     defaults to "error" which hides useful diagnostic messages).
  if (!process.env.LOG_LEVEL) {
    process.env.LOG_LEVEL = config.logging?.level ?? "info";
  }

  // 2. Push channel secrets into process.env for plugin discovery
  applyConnectorSecretsToEnv(config);

  // 2b. Propagate cloud config into process.env for ElizaCloud plugin
  applyCloudConfigToEnv(config);

  // 2c. Propagate x402 config into process.env
  applyX402ConfigToEnv(config);

  // 2d. Propagate database config into process.env for plugin-sql
  applyDatabaseConfigToEnv(config);

  // 2d-ii. Allow destructive migrations (e.g. dropping tables removed between
  //        plugin versions) so the runtime doesn't silently stall.  Without this
  //        the migration system throws an error that gets swallowed, leaving the
  //        app hanging indefinitely with no output.
  if (!process.env.ELIZA_ALLOW_DESTRUCTIVE_MIGRATIONS) {
    process.env.ELIZA_ALLOW_DESTRUCTIVE_MIGRATIONS = "true";
  }

  // 2e. Prevent @elizaos/core from auto-loading @elizaos/plugin-bootstrap.
  //     Milaidy uses @elizaos/plugin-trust which provides the settings/roles
  //     providers and actions.  plugin-bootstrap (v1.x) is incompatible with
  //     the 2.0.0-alpha.x runtime used here.
  if (!process.env.IGNORE_BOOTSTRAP) {
    process.env.IGNORE_BOOTSTRAP = "true";
  }

  // 2f. Apply subscription-based credentials (Claude Max, Codex Max)
  try {
    const { applySubscriptionCredentials } = await import("../auth/index.js");
    await applySubscriptionCredentials();
  } catch (err) {
    logger.warn(`[milaidy] Failed to apply subscription credentials: ${err}`);
  }

  // 3. Build ElizaOS Character from Milaidy config
  const character = buildCharacterFromConfig(config);

  const primaryModel = resolvePrimaryModel(config);

  // 4. Ensure workspace exists with bootstrap files
  const workspaceDir =
    config.agents?.defaults?.workspace ?? resolveDefaultAgentWorkspaceDir();
  await ensureAgentWorkspace({ dir: workspaceDir, ensureBootstrapFiles: true });

  // 4b. Ensure custom plugins directory exists for drop-in plugins
  await fs.mkdir(path.join(resolveStateDir(), CUSTOM_PLUGINS_DIRNAME), {
    recursive: true,
  });

  // 5. Create the Milaidy bridge plugin (workspace context + session keys + compaction)
  const agentId = character.name?.toLowerCase().replace(/\s+/g, "-") ?? "main";
  const milaidyPlugin = createMilaidyPlugin({
    workspaceDir,
    bootstrapMaxChars: config.agents?.defaults?.bootstrapMaxChars,
    enableBootstrapProviders: config.agents?.defaults?.enableBootstrapProviders,
    agentId,
  });

  // 5b. Optional: Phetta Companion bridge (VRM desktop pet)
  const phettaOpts = resolvePhettaCompanionOptionsFromEnv(process.env);
  const phettaPlugin = phettaOpts.enabled
    ? createPhettaCompanionPlugin(phettaOpts)
    : null;

  // 6. Resolve and load plugins
  // In headless (GUI) mode before onboarding, the user hasn't configured a
  // provider yet.  Downgrade diagnostics so the expected "no AI provider"
  // state doesn't appear as a scary Error in the terminal.
  const preOnboarding = opts?.headless && !config.agents;
  const resolvedPlugins = await resolvePlugins(config, {
    quiet: preOnboarding,
  });

  if (resolvedPlugins.length === 0) {
    if (preOnboarding) {
      logger.info(
        "[milaidy] No plugins loaded yet — the onboarding wizard will configure a model provider",
      );
    } else {
      logger.error(
        "[milaidy] No plugins loaded — at least one model provider plugin is required",
      );
      logger.error(
        "[milaidy] Set an API key (e.g. ANTHROPIC_API_KEY, OPENAI_API_KEY) in your environment",
      );
      throw new Error("No plugins loaded");
    }
  }

  // 6b. Debug logging — print full context after provider + plugin resolution
  {
    const pluginNames = resolvedPlugins.map((p) => p.name);
    const providerNames = resolvedPlugins
      .flatMap((p) => p.plugin.providers ?? [])
      .map((prov) => prov.name);
    // Build a context summary for validation
    const contextSummary: Record<string, unknown> = {
      agentName: character.name,
      pluginCount: resolvedPlugins.length,
      providerCount: providerNames.length,
      primaryModel: primaryModel ?? "(auto-detect)",
      workspaceDir,
    };
    debugLogResolvedContext(pluginNames, providerNames, contextSummary, (msg) =>
      logger.debug(msg),
    );

    // Validate the context and surface issues early
    const contextValidation = validateRuntimeContext(contextSummary);
    if (!contextValidation.valid) {
      const issues: string[] = [];
      if (contextValidation.nullFields.length > 0) {
        issues.push(`null: ${contextValidation.nullFields.join(", ")}`);
      }
      if (contextValidation.undefinedFields.length > 0) {
        issues.push(
          `undefined: ${contextValidation.undefinedFields.join(", ")}`,
        );
      }
      if (contextValidation.emptyFields.length > 0) {
        issues.push(`empty: ${contextValidation.emptyFields.join(", ")}`);
      }
      logger.warn(
        `[milaidy] Context validation issues detected: ${issues.join("; ")}`,
      );
    }
  }

  // 7. Create the AgentRuntime with Milaidy plugin + resolved plugins
  //    plugin-sql must be registered first so its database adapter is available
  //    before other plugins (e.g. plugin-personality) run their init functions.
  //    runtime.initialize() registers all characterPlugins in parallel, so we
  //    pre-register plugin-sql here to avoid the race condition.
  //
  //    plugin-local-embedding must also be pre-registered so its TEXT_EMBEDDING
  //    handler (priority 10) is available before any services start.  Without
  //    this, the bootstrap plugin's ActionFilterService and EmbeddingGeneration
  //    service can race ahead and use the cloud plugin's TEXT_EMBEDDING handler
  //    (priority 0) — which hits a paid API — because local-embedding's init()
  //    takes longer (environment setup, model path validation) and hasn't
  //    registered its model handler yet when services start generating embeddings.
  const PREREGISTER_PLUGINS = new Set([
    "@elizaos/plugin-sql",
    "@elizaos/plugin-local-embedding",
  ]);
  const sqlPlugin = resolvedPlugins.find(
    (p) => p.name === "@elizaos/plugin-sql",
  );
  const localEmbeddingPlugin = resolvedPlugins.find(
    (p) => p.name === "@elizaos/plugin-local-embedding",
  );
  const otherPlugins = resolvedPlugins.filter(
    (p) => !PREREGISTER_PLUGINS.has(p.name),
  );

  // Resolve the runtime log level from config (AgentRuntime doesn't support
  // "silent", so we map it to "fatal" as the quietest supported level).
  // Default to "info" to keep runtime logs visible for diagnostics.
  const runtimeLogLevel = (() => {
    // process.env.LOG_LEVEL is already resolved (set explicitly or from
    // config.logging.level above), so prefer it to honour the dev-mode
    // LOG_LEVEL=error override set by scripts/dev-ui.mjs.
    const lvl = process.env.LOG_LEVEL ?? config.logging?.level;
    if (!lvl) return "info" as const;
    if (lvl === "silent") return "fatal" as const;
    return lvl as "trace" | "debug" | "info" | "warn" | "error" | "fatal";
  })();

  // 7a. Resolve bundled skills directory from @elizaos/skills so
  //     plugin-agent-skills auto-loads them on startup.
  let bundledSkillsDir: string | null = null;
  try {
    const { getSkillsDir } = (await import("@elizaos/skills")) as {
      getSkillsDir: () => string;
    };
    bundledSkillsDir = getSkillsDir();
    logger.info(`[milaidy] Bundled skills dir: ${bundledSkillsDir}`);
  } catch {
    logger.debug(
      "[milaidy] @elizaos/skills not available — bundled skills will not be loaded",
    );
  }

  // Workspace skills directory (highest precedence for overrides)
  const workspaceSkillsDir = workspaceDir ? `${workspaceDir}/skills` : null;

  let runtime = new AgentRuntime({
    character,
    plugins: [
      milaidyPlugin,
      ...(phettaPlugin ? [phettaPlugin] : []),
      ...otherPlugins.map((p) => p.plugin),
    ],
    ...(runtimeLogLevel ? { logLevel: runtimeLogLevel } : {}),
    settings: {
      // Forward Milaidy config env vars as runtime settings
      ...(primaryModel ? { MODEL_PROVIDER: primaryModel } : {}),
      // Forward skills config so plugin-agent-skills can apply allow/deny filtering
      ...(config.skills?.allowBundled
        ? { SKILLS_ALLOWLIST: config.skills.allowBundled.join(",") }
        : {}),
      ...(config.skills?.denyBundled
        ? { SKILLS_DENYLIST: config.skills.denyBundled.join(",") }
        : {}),
      // Tell plugin-agent-skills where to find bundled + workspace skills
      ...(bundledSkillsDir ? { BUNDLED_SKILLS_DIRS: bundledSkillsDir } : {}),
      ...(workspaceSkillsDir
        ? { WORKSPACE_SKILLS_DIR: workspaceSkillsDir }
        : {}),
      // Also forward extra dirs from config
      ...(config.skills?.load?.extraDirs?.length
        ? { EXTRA_SKILLS_DIRS: config.skills.load.extraDirs.join(",") }
        : {}),
      // Disable image description when vision is explicitly toggled off.
      // The cloud plugin always registers IMAGE_DESCRIPTION, so we need a
      // runtime setting to prevent the message service from calling it.
      ...(config.features?.vision === false
        ? { DISABLE_IMAGE_DESCRIPTION: "true" }
        : {}),
    },
  });

  // 7b. Pre-register plugin-sql so the adapter is ready before other plugins init.
  //     This is OPTIONAL — without it, some features (memory, todos) won't work.
  //     runtime.db is a getter that returns this.adapter.db and throws when
  //     this.adapter is undefined, so plugins that use runtime.db will fail.
  if (sqlPlugin) {
    await runtime.registerPlugin(sqlPlugin.plugin);
    console.log("sqlPlugin", sqlPlugin);

    // 7c. Eagerly initialize the database adapter so it's fully ready (connection
    //     open, schema bootstrapped) BEFORE other plugins run their init().
    //     runtime.initialize() also calls adapter.init() but that happens AFTER
    //     all plugin inits — too late for plugins that need runtime.db during init.
    //     The call is idempotent (runtime.initialize checks adapter.isReady()).
    if (runtime.adapter && !(await runtime.adapter.isReady())) {
      await runtime.adapter.init();
      logger.info(
        "[milaidy] Database adapter initialized early (before plugin inits)",
      );
    }
  } else {
    const loadedNames = resolvedPlugins.map((p) => p.name).join(", ");
    logger.error(
      `[milaidy] @elizaos/plugin-sql was NOT found among resolved plugins. ` +
        `Loaded: [${loadedNames}]`,
    );
    throw new Error(
      "@elizaos/plugin-sql is required but was not loaded. " +
        "Ensure the package is installed and built (check for import errors above).",
    );
  }

  // 7c. Eagerly initialize the database adapter so it's fully ready (connection
  //     open, schema bootstrapped) BEFORE other plugins run their init().
  //     runtime.initialize() also calls adapter.init() but that happens AFTER
  //     all plugin inits — too late for plugins that need runtime.db during init.
  //     The call is idempotent (runtime.initialize checks adapter.isReady()).
  if (runtime.adapter && !(await runtime.adapter.isReady())) {
    await runtime.adapter.init();
    logger.info(
      "[milaidy] Database adapter initialized early (before plugin inits)",
    );
  }

  // 7d. Pre-register plugin-local-embedding so its TEXT_EMBEDDING handler
  //     (priority 10) is available before runtime.initialize() starts all
  //     plugins in parallel.  Without this, the bootstrap plugin's services
  //     (ActionFilterService, EmbeddingGenerationService) race ahead and use
  //     the cloud plugin's TEXT_EMBEDDING handler — which hits a paid API —
  //     because local-embedding's heavier init hasn't completed yet.
  if (localEmbeddingPlugin) {
    await runtime.registerPlugin(localEmbeddingPlugin.plugin);
    logger.info(
      "[milaidy] plugin-local-embedding pre-registered (TEXT_EMBEDDING ready)",
    );
  } else {
    logger.warn(
      "[milaidy] @elizaos/plugin-local-embedding not found — embeddings " +
        "will fall back to whatever TEXT_EMBEDDING handler is registered by " +
        "other plugins (may incur cloud API costs)",
    );
  }

  // 8. Initialize the runtime (registers remaining plugins, starts services)
  await runtime.initialize();

  // 9. Graceful shutdown handler
  //
  // In headless mode the caller (dev-server / Electron) owns the process
  // lifecycle, so we must NOT register signal handlers here — they would
  // stack on every hot-restart, close over stale runtime references, and
  // race with bun --watch's own process teardown.
  if (!opts?.headless) {
    let isShuttingDown = false;

    const shutdown = async (): Promise<void> => {
      if (isShuttingDown) return;
      isShuttingDown = true;

      try {
        await runtime.stop();
      } catch (err) {
        logger.warn(`[milaidy] Error during shutdown: ${formatError(err)}`);
      }
      process.exit(0);
    };

    process.on("SIGINT", () => void shutdown());
    process.on("SIGTERM", () => void shutdown());
  }

  // 10. Load hooks system
  try {
    const internalHooksConfig = config.hooks
      ?.internal as LoadHooksOptions["internalConfig"];

    await loadHooks({
      workspacePath: workspaceDir,
      internalConfig: internalHooksConfig,
      milaidyConfig: config as Record<string, unknown>,
    });

    const startupEvent = createHookEvent("gateway", "startup", "system", {
      cfg: config,
    });
    await triggerHook(startupEvent);
  } catch (err) {
    logger.warn(`[milaidy] Hooks system could not load: ${formatError(err)}`);
  }

  // ── Headless mode — return runtime for API server wiring ──────────────
  if (opts?.headless) {
    logger.info(
      "[milaidy] Runtime initialised in headless mode (autonomy enabled)",
    );
    return runtime;
  }

  // ── Start API server for GUI access ──────────────────────────────────────
  // In CLI mode (non-headless), start the API server in the background so
  // the GUI can connect to the running agent.  This ensures full feature
  // parity: whether started via `npx milaidy`, `bun run dev`, or the
  // desktop app, the API server is always available for the GUI admin
  // surface.
  try {
    const { startApiServer } = await import("../api/server.js");
    const apiPort = Number(process.env.MILAIDY_PORT) || 2138;
    const { port: actualApiPort } = await startApiServer({
      port: apiPort,
      runtime,
      onRestart: async () => {
        logger.info("[milaidy] Hot-reload: Restarting runtime...");
        try {
          // Stop the old runtime to release resources (DB connections, timers, etc.)
          try {
            await runtime.stop();
          } catch (stopErr) {
            logger.warn(
              `[milaidy] Hot-reload: old runtime stop failed: ${formatError(stopErr)}`,
            );
          }

          // Reload config from disk (updated by API)
          const freshConfig = loadMilaidyConfig();

          // Propagate secrets & cloud config into process.env so plugins
          // (especially plugin-elizacloud) can discover them.  The initial
          // startup does this in startEliza(); the hot-reload must repeat it
          // because the config may have changed (e.g. cloud enabled during
          // onboarding).
          applyConnectorSecretsToEnv(freshConfig);
          applyCloudConfigToEnv(freshConfig);
          applyX402ConfigToEnv(freshConfig);
          applyDatabaseConfigToEnv(freshConfig);

          // Apply subscription-based credentials (Claude Max, Codex Max)
          // that may have been set up during onboarding.
          try {
            const { applySubscriptionCredentials } = await import(
              "../auth/index.js"
            );
            await applySubscriptionCredentials();
          } catch (subErr) {
            logger.warn(
              `[milaidy] Hot-reload: subscription credentials: ${formatError(subErr)}`,
            );
          }

          // Resolve plugins using same function as startup
          const resolvedPlugins = await resolvePlugins(freshConfig);

          // Rebuild character from the fresh config so onboarding changes
          // (name, bio, style, etc.) are picked up on restart.
          const freshCharacter = buildCharacterFromConfig(freshConfig);

          // Recreate Milaidy plugin with fresh workspace
          const freshMilaidyPlugin = createMilaidyPlugin({
            workspaceDir:
              freshConfig.agents?.defaults?.workspace ?? workspaceDir,
            bootstrapMaxChars: freshConfig.agents?.defaults?.bootstrapMaxChars,
            enableBootstrapProviders:
              freshConfig.agents?.defaults?.enableBootstrapProviders,
            agentId:
              freshCharacter.name?.toLowerCase().replace(/\s+/g, "-") ?? "main",
          });

          // Create new runtime with updated plugins.
          // Filter out pre-registered plugins so they aren't double-loaded
          // inside initialize()'s Promise.all — same pattern as the initial
          // startup to avoid the TEXT_EMBEDDING race condition.
          const freshPrimaryModel = resolvePrimaryModel(freshConfig);
          const freshOtherPlugins = resolvedPlugins.filter(
            (p) => !PREREGISTER_PLUGINS.has(p.name),
          );
          const newRuntime = new AgentRuntime({
            character: freshCharacter,
            plugins: [
              freshMilaidyPlugin,
              ...freshOtherPlugins.map((p) => p.plugin),
            ],
            ...(runtimeLogLevel ? { logLevel: runtimeLogLevel } : {}),
            settings: {
              ...(freshPrimaryModel
                ? { MODEL_PROVIDER: freshPrimaryModel }
                : {}),
              // Disable image description when vision is explicitly toggled off.
              ...(freshConfig.features?.vision === false
                ? { DISABLE_IMAGE_DESCRIPTION: "true" }
                : {}),
            },
          });

          // Pre-register plugin-sql + local-embedding before initialize()
          // to avoid the same race condition as the initial startup.
          if (sqlPlugin) {
            await newRuntime.registerPlugin(sqlPlugin.plugin);
            if (newRuntime.adapter && !(await newRuntime.adapter.isReady())) {
              await newRuntime.adapter.init();
            }
          }
          if (localEmbeddingPlugin) {
            await newRuntime.registerPlugin(localEmbeddingPlugin.plugin);
          }

          await newRuntime.initialize();
          runtime = newRuntime;
          logger.info("[milaidy] Hot-reload: Runtime restarted successfully");
          return newRuntime;
        } catch (err) {
          logger.error(`[milaidy] Hot-reload failed: ${formatError(err)}`);
          return null;
        }
      },
    });
    logger.info(
      `[milaidy] API server listening on http://localhost:${actualApiPort}`,
    );
  } catch (apiErr) {
    logger.warn(`[milaidy] Could not start API server: ${formatError(apiErr)}`);
    // Non-fatal — CLI chat loop still works without the API server.
  }

  // ── Interactive chat loop ────────────────────────────────────────────────
  const agentName = character.name ?? "Milaidy";
  const userId = crypto.randomUUID() as UUID;
  // Use `let` so the fallback path can reassign to fresh IDs.
  let roomId = stringToUuid(`${agentName}-chat-room`);

  try {
    const worldId = stringToUuid(`${agentName}-chat-world`);
    // Use a deterministic messageServerId so the settings provider
    // can reference the world by serverId after it is found.
    const messageServerId = stringToUuid(`${agentName}-cli-server`) as UUID;
    await runtime.ensureConnection({
      entityId: userId,
      roomId,
      worldId,
      userName: "User",
      source: "cli",
      channelId: `${agentName}-chat`,
      type: ChannelType.DM,
      messageServerId,
      metadata: { ownership: { ownerId: userId } },
    });
    // Ensure the world has ownership metadata so the settings
    // provider can locate it via findWorldsForOwner during onboarding.
    // This also handles worlds that already exist from a prior session
    // but were created without ownership metadata.
    const world = await runtime.getWorld(worldId);
    if (world) {
      let needsUpdate = false;
      if (!world.metadata) {
        world.metadata = {};
        needsUpdate = true;
      }
      if (
        !world.metadata.ownership ||
        typeof world.metadata.ownership !== "object" ||
        (world.metadata.ownership as { ownerId: string }).ownerId !== userId
      ) {
        world.metadata.ownership = { ownerId: userId };
        needsUpdate = true;
      }
      if (needsUpdate) {
        await runtime.updateWorld(world);
      }
    }
  } catch (err) {
    logger.warn(
      `[milaidy] Could not establish chat room, retrying with fresh IDs: ${formatError(err)}`,
    );

    // Fall back to unique IDs if deterministic ones conflict with stale data.
    // IMPORTANT: reassign roomId so the message loop below uses the same room.
    roomId = crypto.randomUUID() as UUID;
    const freshWorldId = crypto.randomUUID() as UUID;
    const freshServerId = crypto.randomUUID() as UUID;
    try {
      await runtime.ensureConnection({
        entityId: userId,
        roomId,
        worldId: freshWorldId,
        userName: "User",
        source: "cli",
        channelId: `${agentName}-chat`,
        type: ChannelType.DM,
        messageServerId: freshServerId,
        metadata: { ownership: { ownerId: userId } },
      });
      // Same ownership metadata fix for the fallback world.
      const fallbackWorld = await runtime.getWorld(freshWorldId);
      if (fallbackWorld) {
        let needsUpdate = false;
        if (!fallbackWorld.metadata) {
          fallbackWorld.metadata = {};
          needsUpdate = true;
        }
        if (
          !fallbackWorld.metadata.ownership ||
          typeof fallbackWorld.metadata.ownership !== "object" ||
          (fallbackWorld.metadata.ownership as { ownerId: string }).ownerId !==
            userId
        ) {
          fallbackWorld.metadata.ownership = { ownerId: userId };
          needsUpdate = true;
        }
        if (needsUpdate) {
          await runtime.updateWorld(fallbackWorld);
        }
      }
    } catch (retryErr) {
      logger.error(
        `[milaidy] Chat room setup failed after retry: ${formatError(retryErr)}`,
      );
      throw retryErr;
    }
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log(`\n💬 Chat with ${agentName} (type 'exit' to quit)\n`);

  const prompt = () => {
    rl.question("You: ", async (input) => {
      const text = input.trim();

      if (text.toLowerCase() === "exit" || text.toLowerCase() === "quit") {
        console.log("\nGoodbye!");
        rl.close();
        try {
          await runtime.stop();
        } catch (err) {
          logger.warn(`[milaidy] Error stopping runtime: ${formatError(err)}`);
        }
        process.exit(0);
      }

      if (!text) {
        prompt();
        return;
      }

      try {
        const message = createMessageMemory({
          id: crypto.randomUUID() as UUID,
          entityId: userId,
          roomId,
          content: {
            text,
            source: "client_chat",
            channelType: ChannelType.DM,
          },
        });

        process.stdout.write(`${agentName}: `);

        if (!runtime.messageService) {
          logger.error(
            "[milaidy] runtime.messageService is not available — cannot process messages",
          );
          console.log("[Error: message service unavailable]\n");
          prompt();
          return;
        }

        await runtime.messageService.handleMessage(
          runtime,
          message,
          async (content) => {
            if (content?.text) {
              process.stdout.write(content.text);
            }
            return [];
          },
        );

        console.log("\n");
      } catch (err) {
        // Log the error and continue the prompt loop — don't let a single
        // failed message kill the interactive session.
        console.log(`\n[Error: ${formatError(err)}]\n`);
        logger.error(
          `[milaidy] Chat message handling failed: ${formatError(err)}`,
        );
      }
      prompt();
    });
  };

  prompt();
}

// When run directly (not imported), start immediately.
// Use path.resolve to normalise both sides before comparing so that
// symlinks, trailing slashes, and relative paths don't cause false negatives.
const isDirectRun = (() => {
  const scriptArg = process.argv[1];
  if (!scriptArg) return false;
  const normalised = path.resolve(scriptArg);
  // Exact match against this module's file URL
  if (import.meta.url === pathToFileURL(normalised).href) return true;
  // Fallback: match the specific filename (handles tsx rewriting)
  const base = path.basename(normalised);
  return base === "eliza.ts" || base === "eliza.js";
})();

if (isDirectRun) {
  startEliza().catch((err) => {
    console.error(
      "[milaidy] Fatal error:",
      err instanceof Error ? (err.stack ?? err.message) : err,
    );
    process.exit(1);
  });
}
