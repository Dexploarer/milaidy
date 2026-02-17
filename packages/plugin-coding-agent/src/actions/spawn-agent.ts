/**
 * SPAWN_CODING_AGENT action - Spawns a CLI coding agent
 *
 * Creates a new PTY session for a coding agent (Claude Code, Codex, etc.)
 * and returns a session ID for subsequent interactions.
 *
 * @module actions/spawn-agent
 */

import type { Action, IAgentRuntime, Memory, State, HandlerCallback, ActionResult, HandlerOptions } from "@elizaos/core";
import { PTYService, type SessionInfo, type CodingAgentType } from "../services/pty-service.js";
import type { AgentCredentials } from "coding-agent-adapters";

/** Normalize user-provided agent type to adapter type */
const normalizeAgentType = (input: string): CodingAgentType => {
  const normalized = input.toLowerCase().trim();
  const mapping: Record<string, CodingAgentType> = {
    "claude": "claude",
    "claude-code": "claude",
    "claudecode": "claude",
    "codex": "codex",
    "openai": "codex",
    "openai-codex": "codex",
    "gemini": "gemini",
    "google": "gemini",
    "aider": "aider",
    "shell": "shell",
    "bash": "shell",
  };
  return mapping[normalized] ?? "claude";
};

export const spawnAgentAction: Action = {
  name: "SPAWN_CODING_AGENT",

  similes: [
    "START_CODING_AGENT",
    "LAUNCH_CODING_AGENT",
    "CREATE_CODING_AGENT",
    "SPAWN_CODER",
    "RUN_CODING_AGENT",
  ],

  description:
    "Spawn a CLI coding agent (Claude Code, Codex, Gemini, Aider) to work on a coding task. " +
    "The agent runs in a PTY session and can execute code, run tests, and make changes. " +
    "Returns a session ID that can be used to interact with the agent.",

  examples: [
    [
      {
        name: "{{user1}}",
        content: { text: "Spawn Claude Code to fix the bug in auth.ts" },
      },
      {
        name: "{{agentName}}",
        content: {
          text: "I'll spawn Claude Code to work on that. Let me set up the coding session.",
          action: "SPAWN_CODING_AGENT",
        },
      },
    ],
    [
      {
        name: "{{user1}}",
        content: { text: "Start a coding agent to implement the new feature" },
      },
      {
        name: "{{agentName}}",
        content: {
          text: "I'll create a coding session for that task.",
          action: "SPAWN_CODING_AGENT",
        },
      },
    ],
  ],

  validate: async (runtime: IAgentRuntime, _message: Memory): Promise<boolean> => {
    // Check if PTYService is available
    const ptyService = runtime.getService("PTY_SERVICE") as unknown as PTYService | undefined;
    if (!ptyService) {
      console.warn("[SPAWN_CODING_AGENT] PTYService not available");
      return false;
    }
    return true;
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state?: State,
    options?: HandlerOptions,
    callback?: HandlerCallback,
  ): Promise<ActionResult | undefined> => {
    const ptyService = runtime.getService("PTY_SERVICE") as unknown as PTYService | undefined;
    if (!ptyService) {
      if (callback) {
        await callback({
          text: "PTY Service is not available. Cannot spawn coding agent.",
        });
      }
      return { success: false, error: "SERVICE_UNAVAILABLE" };
    }

    // Extract parameters from options or message content
    const params = options?.parameters;
    const content = message.content as Record<string, unknown>;

    const rawAgentType = (params?.agentType as string) ?? (content.agentType as string) ?? "claude";
    const agentType = normalizeAgentType(rawAgentType);
    const workdir = (params?.workdir as string) ?? (content.workdir as string) ?? process.cwd();
    const task = (params?.task as string) ?? (content.task as string);

    // Build credentials from runtime settings if not provided
    const credentials: AgentCredentials = {
      anthropicKey: runtime.getSetting("ANTHROPIC_API_KEY") as string | undefined,
      openaiKey: runtime.getSetting("OPENAI_API_KEY") as string | undefined,
      googleKey: runtime.getSetting("GOOGLE_API_KEY") as string | undefined,
      githubToken: runtime.getSetting("GITHUB_TOKEN") as string | undefined,
    };

    try {
      // Check if the agent CLI is installed (for non-shell agents)
      if (agentType !== "shell") {
        const [preflight] = await ptyService.checkAvailableAgents([agentType as Exclude<CodingAgentType, "shell">]);
        if (preflight && !preflight.installed) {
          if (callback) {
            await callback({
              text: `${preflight.adapter} CLI is not installed.\n` +
                `Install with: ${preflight.installCommand}\n` +
                `Docs: ${preflight.docsUrl}`,
            });
          }
          return { success: false, error: "AGENT_NOT_INSTALLED" };
        }
      }

      // Spawn the PTY session
      const session: SessionInfo = await ptyService.spawnSession({
        name: `coding-${Date.now()}`,
        agentType,
        workdir,
        initialTask: task,
        credentials,
        metadata: {
          requestedType: rawAgentType,
          messageId: message.id,
          userId: (message as unknown as Record<string, unknown>).userId,
        },
      });

      // Register event handler for this session
      ptyService.onSessionEvent((sessionId, event, data) => {
        if (sessionId !== session.id) return;

        // Log session events for debugging
        console.log(`[Session ${sessionId}] ${event}:`, data);

        // Handle blocked state - agent is waiting for input
        if (event === "blocked" && callback) {
          callback({
            text: `Coding agent is waiting for input: ${(data as { prompt?: string }).prompt ?? "unknown prompt"}`,
          });
        }

        // Handle completion
        if (event === "completed" && callback) {
          callback({
            text: "Coding agent completed the task.",
          });
        }

        // Handle errors
        if (event === "error" && callback) {
          callback({
            text: `Coding agent encountered an error: ${(data as { message?: string }).message ?? "unknown error"}`,
          });
        }
      });

      // Store session info in state for subsequent actions
      if (state) {
        state.codingSession = {
          id: session.id,
          agentType: session.agentType,
          workdir: session.workdir,
          status: session.status,
        };
      }

      if (callback) {
        await callback({
          text: `Started ${agentType} coding agent in ${workdir}${task ? ` with task: "${task}"` : ""}. Session ID: ${session.id}`,
        });
      }

      return {
        success: true,
        text: `Started ${agentType} coding agent`,
        data: {
          sessionId: session.id,
          agentType: session.agentType,
          workdir: session.workdir,
          status: session.status,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error("[SPAWN_CODING_AGENT] Failed to spawn agent:", errorMessage);

      if (callback) {
        await callback({
          text: `Failed to spawn coding agent: ${errorMessage}`,
        });
      }

      return { success: false, error: errorMessage };
    }
  },

  parameters: [
    {
      name: "agentType",
      description:
        "Type of coding agent to spawn. Options: claude (Claude Code), codex (OpenAI Codex), gemini (Google Gemini), aider, shell (generic shell)",
      required: false,
      schema: { type: "string" as const, default: "claude" },
    },
    {
      name: "workdir",
      description: "Working directory for the agent. Defaults to current directory.",
      required: false,
      schema: { type: "string" as const },
    },
    {
      name: "task",
      description: "Initial task or prompt to send to the agent once spawned.",
      required: false,
      schema: { type: "string" as const },
    },
  ],
};
