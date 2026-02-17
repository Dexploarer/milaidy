/**
 * Coding Agent Plugin for Milaidy
 *
 * Provides orchestration capabilities for CLI-based coding agents:
 * - PTY session management (spawn, control, monitor coding agents)
 * - Git workspace provisioning (clone, branch, PR creation)
 * - Integration with Claude Code, Codex, Gemini CLI, Aider, etc.
 *
 * @module @milaidy/plugin-coding-agent
 */

import type { Plugin } from "@elizaos/core";

// Services
import { PTYService } from "./services/pty-service.js";
import { CodingWorkspaceService } from "./services/workspace-service.js";

// Actions - PTY management
import { spawnAgentAction } from "./actions/spawn-agent.js";
import { sendToAgentAction } from "./actions/send-to-agent.js";
import { stopAgentAction } from "./actions/stop-agent.js";
import { listAgentsAction } from "./actions/list-agents.js";

// Actions - Workspace management
import { provisionWorkspaceAction } from "./actions/provision-workspace.js";
import { finalizeWorkspaceAction } from "./actions/finalize-workspace.js";

export const codingAgentPlugin: Plugin = {
  name: "@milaidy/plugin-coding-agent",
  description:
    "Orchestrate CLI coding agents (Claude Code, Codex, etc.) via PTY sessions " +
    "and manage git workspaces for autonomous coding tasks",

  // Services manage PTY sessions and git workspaces
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  services: [PTYService as any, CodingWorkspaceService as any],

  // Actions expose capabilities to the agent
  actions: [
    // PTY session management
    spawnAgentAction,
    sendToAgentAction,
    stopAgentAction,
    listAgentsAction,
    // Workspace management
    provisionWorkspaceAction,
    finalizeWorkspaceAction,
  ],

  // No evaluators needed for now
  evaluators: [],

  // No providers needed for now
  providers: [],
};

export default codingAgentPlugin;

// Re-export services for direct access
export { PTYService } from "./services/pty-service.js";
export { CodingWorkspaceService } from "./services/workspace-service.js";

// Re-export service types
export type {
  PTYServiceConfig,
  SpawnSessionOptions,
  SessionInfo,
  CodingAgentType,
} from "./services/pty-service.js";

// Re-export coding agent adapter types
export type {
  AdapterType,
  AgentCredentials,
  PreflightResult,
} from "coding-agent-adapters";

export type {
  CodingWorkspaceConfig,
  ProvisionWorkspaceOptions,
  WorkspaceResult,
  CommitOptions,
  PushOptions,
} from "./services/workspace-service.js";

// Re-export actions
export { spawnAgentAction } from "./actions/spawn-agent.js";
export { sendToAgentAction } from "./actions/send-to-agent.js";
export { stopAgentAction } from "./actions/stop-agent.js";
export { listAgentsAction } from "./actions/list-agents.js";
export { provisionWorkspaceAction } from "./actions/provision-workspace.js";
export { finalizeWorkspaceAction } from "./actions/finalize-workspace.js";
