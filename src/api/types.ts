import type { AgentRuntime, UUID } from "@elizaos/core";
import type { MilaidyConfig } from "../config/config.js";
import type { CloudManager } from "../cloud/cloud-manager.js";
import type { AppManager } from "../services/app-manager.js";
import type { AnthropicFlow } from "../auth/anthropic.js";
import type { CodexFlow } from "../auth/openai-codex.js";

/** Subset of the core AutonomyService interface we use for lifecycle control. */
export interface AutonomyServiceLike {
  enableAutonomy(): Promise<void>;
  disableAutonomy(): Promise<void>;
  isLoopRunning(): boolean;
}

/** Metadata for a web-chat conversation. */
export interface ConversationMeta {
  id: string;
  title: string;
  roomId: UUID;
  createdAt: string;
  updatedAt: string;
}

export interface ShareIngestItem {
  id: string;
  source: string;
  title?: string;
  url?: string;
  text?: string;
  suggestedPrompt: string;
  receivedAt: number;
}

export interface PluginParamDef {
  key: string;
  type: string;
  description: string;
  required: boolean;
  sensitive: boolean;
  default?: string;
  /** Predefined options for dropdown selection (e.g. model names). */
  options?: string[];
  /** Current value from process.env (masked if sensitive). */
  currentValue: string | null;
  /** Whether a value is currently set in the environment. */
  isSet: boolean;
}

export interface PluginEntry {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  configured: boolean;
  envKey: string | null;
  category: "ai-provider" | "connector" | "database" | "feature";
  /** Where the plugin comes from: "bundled" (ships with Milaidy) or "store" (user-installed from registry). */
  source: "bundled" | "store";
  configKeys: string[];
  parameters: PluginParamDef[];
  validationErrors: Array<{ field: string; message: string }>;
  validationWarnings: Array<{ field: string; message: string }>;
  npmName?: string;
  version?: string;
  pluginDeps?: string[];
  /** Whether this plugin is currently active in the runtime. */
  isActive?: boolean;
}

export interface SkillEntry {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  /** Set automatically when a scan report exists for this skill. */
  scanStatus?: "clean" | "warning" | "critical" | "blocked" | null;
}

export interface LogEntry {
  timestamp: number;
  level: string;
  message: string;
  source: string;
  tags: string[];
}

export interface ServerState {
  runtime: AgentRuntime | null;
  config: MilaidyConfig;
  agentState:
    | "not_started"
    | "running"
    | "paused"
    | "stopped"
    | "restarting"
    | "error";
  agentName: string;
  model: string | undefined;
  startedAt: number | undefined;
  plugins: PluginEntry[];
  skills: SkillEntry[];
  logBuffer: LogEntry[];
  chatRoomId: UUID | null;
  chatUserId: UUID | null;
  /** Conversation metadata by conversation id. */
  conversations: Map<string, ConversationMeta>;
  /** Cloud manager for Eliza Cloud integration (null when cloud is disabled). */
  cloudManager: CloudManager | null;
  /** App manager for launching and managing ElizaOS apps. */
  appManager: AppManager;
  /** In-memory queue for share ingest items. */
  shareIngestQueue: ShareIngestItem[];
  /** Transient OAuth flow state for subscription auth. */
  _anthropicFlow?: AnthropicFlow;
  _codexFlow?: CodexFlow;
  _codexFlowTimer?: ReturnType<typeof setTimeout>;
}

export interface RequestContext {
  onRestart: (() => Promise<AgentRuntime | null>) | null;
}

export interface PluginIndexEntry {
  id: string;
  dirName: string;
  name: string;
  npmName: string;
  description: string;
  category: "ai-provider" | "connector" | "database" | "feature";
  envKey: string | null;
  configKeys: string[];
  pluginParameters?: Record<string, Record<string, unknown>>;
  version?: string;
  pluginDeps?: string[];
}

export interface PluginIndex {
  $schema: string;
  generatedAt: string;
  count: number;
  plugins: PluginIndexEntry[];
}

/** Shape stored in the cache: maps skill ID → enabled flag. */
export type SkillPreferencesMap = Record<string, boolean>;

export type SkillAcknowledgmentMap = Record<
  string,
  { acknowledgedAt: string; findingCount: number }
>;
