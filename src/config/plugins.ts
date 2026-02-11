// ---------------------------------------------------------------------------
// Plugin resolution
// ---------------------------------------------------------------------------

/** Core plugins that should always be loaded. */
export const CORE_PLUGINS: readonly string[] = [
  "@elizaos/plugin-sql", // database adapter — required
  "@elizaos/plugin-local-embedding", // local embeddings — required for memory
  "@elizaos/plugin-agent-skills", // skill execution
  "@elizaos/plugin-agent-orchestrator", // multi-agent orchestration
  "@elizaos/plugin-shell", // shell command execution
  "@elizaos/plugin-plugin-manager", // dynamic plugin management
];

/**
 * Plugins that can be enabled from the admin panel.
 * Not loaded by default — kept separate due to packaging or spec issues.
 */
export const OPTIONAL_CORE_PLUGINS: readonly string[] = [
  "@elizaos/plugin-form", // packaging issue
  "@elizaos/plugin-goals", // spec mismatch
  "@elizaos/plugin-scheduling", // packaging issue
  "@elizaos/plugin-knowledge", // knowledge retrieval — required for RAG
  "@elizaos/plugin-directives", // directive processing
  "@elizaos/plugin-commands", // slash command handling
  "@elizaos/plugin-personality", // personality coherence
  "@elizaos/plugin-experience", // learning from interactions
  "@elizaos/plugin-cli", // CLI interface
  "@elizaos/plugin-code", // code writing and file operations
  "@elizaos/plugin-edge-tts", // text-to-speech
  "@elizaos/plugin-mcp", // MCP protocol support
  "@elizaos/plugin-pdf", // PDF processing
  "@elizaos/plugin-scratchpad", // scratchpad notes
  "@elizaos/plugin-secrets-manager", // secrets management
  "@elizaos/plugin-todo", // todo/task management
  "@elizaos/plugin-trust", // trust scoring
];

/**
 * Optional plugins that require native binaries or specific config.
 * These are only loaded when explicitly enabled via features config,
 * NOT by default — they crash if their prerequisites are missing.
 */
export const OPTIONAL_NATIVE_PLUGINS: readonly string[] = [
  "@elizaos/plugin-browser", // requires browser server binary
  "@elizaos/plugin-vision", // requires @tensorflow/tfjs-node native addon
  "@elizaos/plugin-cron", // requires worldId at service init
  "@elizaos/plugin-computeruse", // requires platform-specific binaries
];

/** Maps Milaidy channel names to ElizaOS plugin package names. */
export const CHANNEL_PLUGIN_MAP: Readonly<Record<string, string>> = {
  discord: "@elizaos/plugin-discord",
  telegram: "@milaidy/plugin-telegram-enhanced",
  slack: "@elizaos/plugin-slack",
  whatsapp: "@elizaos/plugin-whatsapp",
  signal: "@elizaos/plugin-signal",
  imessage: "@elizaos/plugin-imessage",
  bluebubbles: "@elizaos/plugin-bluebubbles",
  msteams: "@elizaos/plugin-msteams",
  mattermost: "@elizaos/plugin-mattermost",
  googlechat: "@elizaos/plugin-google-chat",
};

/** Maps environment variable names to model-provider plugin packages. */
export const PROVIDER_PLUGIN_MAP: Readonly<Record<string, string>> = {
  ANTHROPIC_API_KEY: "@elizaos/plugin-anthropic",
  OPENAI_API_KEY: "@elizaos/plugin-openai",
  GOOGLE_API_KEY: "@elizaos/plugin-google-genai",
  GOOGLE_GENERATIVE_AI_API_KEY: "@elizaos/plugin-google-genai",
  GROQ_API_KEY: "@elizaos/plugin-groq",
  XAI_API_KEY: "@elizaos/plugin-xai",
  OPENROUTER_API_KEY: "@elizaos/plugin-openrouter",
  AI_GATEWAY_API_KEY: "@elizaos/plugin-vercel-ai-gateway",
  AIGATEWAY_API_KEY: "@elizaos/plugin-vercel-ai-gateway",
  OLLAMA_BASE_URL: "@elizaos/plugin-ollama",
  ZAI_API_KEY: "@homunculuslabs/plugin-zai",
  // ElizaCloud — loaded when API key is present OR cloud is explicitly enabled
  ELIZAOS_CLOUD_API_KEY: "@elizaos/plugin-elizacloud",
  ELIZAOS_CLOUD_ENABLED: "@elizaos/plugin-elizacloud",
};

/**
 * Optional feature plugins keyed by feature name.
 *
 * Currently empty — reserved for future feature→plugin mappings.
 * The lookup code in {@link collectPluginNames} is intentionally kept
 * so new entries work without additional wiring.
 */
export const OPTIONAL_PLUGIN_MAP: Readonly<Record<string, string>> = {
  browser: "@elizaos/plugin-browser",
  vision: "@elizaos/plugin-vision",
  cron: "@elizaos/plugin-cron",
  computeruse: "@elizaos/plugin-computeruse",
  x402: "@elizaos/plugin-x402",
};
