/**
 * PTY Service - Manages PTY sessions for CLI coding agents
 *
 * Wraps pty-manager to provide:
 * - Session lifecycle management (spawn, stop, list)
 * - Adapter registration for different agent types (shell, claude, gemini, codex, aider)
 * - Event forwarding to ElizaOS runtime
 *
 * Uses BunCompatiblePTYManager when running in Bun (spawns Node worker),
 * or PTYManager directly when running in Node.
 *
 * @module services/pty-service
 */

import {
  PTYManager,
  BunCompatiblePTYManager,
  ShellAdapter,
  isBun,
  type SpawnConfig,
  type SessionHandle,
  type SessionMessage,
  type SessionFilter,
  type PTYManagerConfig,
  type WorkerSessionHandle,
} from "pty-manager";
import {
  createAllAdapters,
  checkAdapters,
  type AdapterType,
  type PreflightResult,
  type AgentCredentials,
} from "coding-agent-adapters";
import type { IAgentRuntime } from "@elizaos/core";

export interface PTYServiceConfig {
  /** Maximum output lines to keep per session (default: 1000) */
  maxLogLines?: number;
  /** Enable debug logging */
  debug?: boolean;
  /** Auto-register coding agent adapters (default: true) */
  registerCodingAdapters?: boolean;
}

/** Available coding agent types */
export type CodingAgentType = "shell" | AdapterType;

export interface SpawnSessionOptions {
  /** Human-readable session name */
  name: string;
  /** Adapter type: "shell" | "claude" | "gemini" | "codex" | "aider" */
  agentType: CodingAgentType;
  /** Working directory for the session */
  workdir?: string;
  /** Initial command/task to send */
  initialTask?: string;
  /** Environment variables */
  env?: Record<string, string>;
  /** Session metadata for tracking */
  metadata?: Record<string, unknown>;
  /** Credentials for coding agents (API keys, tokens) */
  credentials?: AgentCredentials;
}

export interface SessionInfo {
  id: string;
  name: string;
  agentType: string;
  workdir: string;
  status: SessionHandle["status"];
  createdAt: Date;
  lastActivityAt: Date;
  metadata?: Record<string, unknown>;
}

type SessionEventCallback = (sessionId: string, event: string, data: unknown) => void;

export class PTYService {
  static serviceType = "PTY_SERVICE";
  capabilityDescription = "Manages PTY sessions for CLI coding agents";

  private runtime: IAgentRuntime;
  private manager: PTYManager | BunCompatiblePTYManager | null = null;
  private usingBunWorker: boolean = false;
  private serviceConfig: PTYServiceConfig;
  private sessionMetadata: Map<string, Record<string, unknown>> = new Map();
  private sessionWorkdirs: Map<string, string> = new Map();
  private eventCallbacks: SessionEventCallback[] = [];
  private outputUnsubscribers: Map<string, () => void> = new Map();

  constructor(runtime: IAgentRuntime, config: PTYServiceConfig = {}) {
    this.runtime = runtime;
    this.serviceConfig = {
      maxLogLines: config.maxLogLines ?? 1000,
      debug: config.debug ?? false,
      registerCodingAdapters: config.registerCodingAdapters ?? true,
    };
  }

  static async start(runtime: IAgentRuntime): Promise<PTYService> {
    const config = runtime.getSetting("PTY_SERVICE_CONFIG") as PTYServiceConfig | null | undefined;
    const service = new PTYService(runtime, config ?? {});
    await service.initialize();
    return service;
  }

  static async stopRuntime(runtime: IAgentRuntime): Promise<void> {
    const service = runtime.getService("PTY_SERVICE") as unknown as PTYService | undefined;
    if (service) {
      await service.stop();
    }
  }

  private async initialize(): Promise<void> {
    this.usingBunWorker = isBun();

    if (this.usingBunWorker) {
      // Use Bun-compatible manager that spawns a Node worker
      this.log("Detected Bun runtime, using BunCompatiblePTYManager");
      const bunManager = new BunCompatiblePTYManager();

      // Set up event forwarding for worker-based manager
      bunManager.on("session_ready", (session: WorkerSessionHandle) => {
        this.emitEvent(session.id, "ready", { session });
      });

      bunManager.on("session_exit", (id: string, code: number) => {
        this.emitEvent(id, "stopped", { reason: `exit code ${code}` });
      });

      bunManager.on("session_error", (id: string, error: string) => {
        this.emitEvent(id, "error", { message: error });
      });

      await bunManager.waitForReady();
      this.manager = bunManager;
    } else {
      // Use native PTYManager directly in Node
      this.log("Using native PTYManager");
      const managerConfig: PTYManagerConfig = {
        maxLogLines: this.serviceConfig.maxLogLines,
      };

      const nodeManager = new PTYManager(managerConfig);

      // Register built-in adapters
      nodeManager.registerAdapter(new ShellAdapter());

      // Register coding agent adapters (claude, gemini, codex, aider)
      if (this.serviceConfig.registerCodingAdapters) {
        const codingAdapters = createAllAdapters();
        for (const adapter of codingAdapters) {
          nodeManager.registerAdapter(adapter);
          this.log(`Registered ${adapter.adapterType} adapter`);
        }
      }

      // Set up event forwarding
      nodeManager.on("session_ready", (session: SessionHandle) => {
        this.emitEvent(session.id, "ready", { session });
      });

      nodeManager.on("blocking_prompt", (session: SessionHandle, promptInfo: unknown, autoResponded: boolean) => {
        this.emitEvent(session.id, "blocked", { promptInfo, autoResponded });
      });

      nodeManager.on("session_stopped", (session: SessionHandle, reason: string) => {
        this.emitEvent(session.id, "stopped", { reason });
      });

      nodeManager.on("session_error", (session: SessionHandle, error: string) => {
        this.emitEvent(session.id, "error", { message: error });
      });

      nodeManager.on("message", (message: SessionMessage) => {
        this.emitEvent(message.sessionId, "message", message);
      });

      this.manager = nodeManager;
    }

    this.log("PTYService initialized");
  }

  async stop(): Promise<void> {
    // Clean up output subscribers
    for (const unsubscribe of this.outputUnsubscribers.values()) {
      unsubscribe();
    }
    this.outputUnsubscribers.clear();

    if (this.manager) {
      await this.manager.shutdown();
      this.manager = null;
    }
    this.sessionMetadata.clear();
    this.sessionWorkdirs.clear();
    this.log("PTYService shutdown complete");
  }

  /**
   * Generate a unique session ID
   */
  private generateSessionId(): string {
    return `pty-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  }

  /**
   * Spawn a new PTY session for a coding agent
   */
  async spawnSession(options: SpawnSessionOptions): Promise<SessionInfo> {
    if (!this.manager) {
      throw new Error("PTYService not initialized");
    }

    const sessionId = this.generateSessionId();
    const workdir = options.workdir ?? process.cwd();

    // Store workdir for later retrieval
    this.sessionWorkdirs.set(sessionId, workdir);

    const spawnConfig: SpawnConfig & { id: string } = {
      id: sessionId,
      name: options.name,
      type: options.agentType,
      workdir,
      env: options.env,
      adapterConfig: options.credentials as Record<string, unknown> | undefined,
    };

    const session = await this.manager.spawn(spawnConfig);

    // Store metadata separately
    if (options.metadata) {
      this.sessionMetadata.set(session.id, options.metadata);
    }

    const sessionInfo = this.toSessionInfo(session, workdir);

    // Send initial task if provided
    if (options.initialTask) {
      await this.sendToSession(session.id, options.initialTask);
    }

    this.log(`Spawned session ${session.id} (${options.agentType})`);
    return sessionInfo;
  }

  /**
   * Send input to a session
   */
  async sendToSession(sessionId: string, input: string): Promise<SessionMessage | void> {
    if (!this.manager) {
      throw new Error("PTYService not initialized");
    }

    const session = this.manager.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    if (this.usingBunWorker) {
      // BunCompatiblePTYManager.send returns void
      await (this.manager as BunCompatiblePTYManager).send(sessionId, input);
      return;
    } else {
      // PTYManager.send returns SessionMessage
      return (this.manager as PTYManager).send(sessionId, input);
    }
  }

  /**
   * Send keys to a session (for special key sequences)
   */
  async sendKeysToSession(sessionId: string, keys: string | string[]): Promise<void> {
    if (!this.manager) {
      throw new Error("PTYService not initialized");
    }

    if (this.usingBunWorker) {
      await (this.manager as BunCompatiblePTYManager).sendKeys(sessionId, keys);
    } else {
      const ptySession = (this.manager as PTYManager).getSession(sessionId);
      if (!ptySession) {
        throw new Error(`Session ${sessionId} not found`);
      }
      ptySession.sendKeys(keys);
    }
  }

  /**
   * Stop a PTY session
   */
  async stopSession(sessionId: string): Promise<void> {
    if (!this.manager) {
      throw new Error("PTYService not initialized");
    }

    const session = this.manager.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    if (this.usingBunWorker) {
      await (this.manager as BunCompatiblePTYManager).kill(sessionId);
    } else {
      await (this.manager as PTYManager).stop(sessionId);
    }

    // Clean up output subscriber
    const unsubscribe = this.outputUnsubscribers.get(sessionId);
    if (unsubscribe) {
      unsubscribe();
      this.outputUnsubscribers.delete(sessionId);
    }

    this.sessionMetadata.delete(sessionId);
    this.sessionWorkdirs.delete(sessionId);
    this.log(`Stopped session ${sessionId}`);
  }

  /**
   * Get session info
   */
  getSession(sessionId: string): SessionInfo | undefined {
    if (!this.manager) {
      return undefined;
    }

    const session = this.manager.get(sessionId);
    if (!session) {
      return undefined;
    }

    return this.toSessionInfo(session, this.sessionWorkdirs.get(sessionId));
  }

  /**
   * List all active sessions
   */
  async listSessions(filter?: SessionFilter): Promise<SessionInfo[]> {
    if (!this.manager) {
      return [];
    }

    if (this.usingBunWorker) {
      const sessions = await (this.manager as BunCompatiblePTYManager).list();
      return sessions.map((s) => this.toSessionInfo(s, this.sessionWorkdirs.get(s.id)));
    } else {
      const sessions = (this.manager as PTYManager).list(filter);
      return sessions.map((s) => this.toSessionInfo(s, this.sessionWorkdirs.get(s.id)));
    }
  }

  /**
   * Subscribe to session output (streaming)
   */
  subscribeToOutput(sessionId: string, callback: (data: string) => void): () => void {
    if (!this.manager) {
      throw new Error("PTYService not initialized");
    }

    if (this.usingBunWorker) {
      const unsubscribe = (this.manager as BunCompatiblePTYManager).onSessionData(sessionId, callback);
      this.outputUnsubscribers.set(sessionId, unsubscribe);
      return unsubscribe;
    } else {
      // For native PTYManager, subscribe to the session's output event
      const ptySession = (this.manager as PTYManager).getSession(sessionId);
      if (!ptySession) {
        throw new Error(`Session ${sessionId} not found`);
      }
      ptySession.on("output", callback);
      const unsubscribe = () => ptySession.off("output", callback);
      this.outputUnsubscribers.set(sessionId, unsubscribe);
      return unsubscribe;
    }
  }

  /**
   * Get recent output from a session (Node PTYManager only)
   * For Bun, use subscribeToOutput instead
   */
  async getSessionOutput(sessionId: string, lines?: number): Promise<string> {
    if (!this.manager) {
      throw new Error("PTYService not initialized");
    }

    if (this.usingBunWorker) {
      // BunCompatiblePTYManager doesn't have logs() - output must be subscribed to
      this.log("getSessionOutput not available with Bun worker - use subscribeToOutput");
      return "";
    }

    const output: string[] = [];
    for await (const line of (this.manager as PTYManager).logs(sessionId, { tail: lines })) {
      output.push(line);
    }
    return output.join("\n");
  }

  /**
   * Check if a session is waiting for input (blocked)
   */
  isSessionBlocked(sessionId: string): boolean {
    const session = this.getSession(sessionId);
    return session?.status === "authenticating";
  }

  /**
   * Check which coding agents are installed and available
   * Returns preflight results for each agent type
   */
  async checkAvailableAgents(types?: AdapterType[]): Promise<PreflightResult[]> {
    const agentTypes = types ?? (["claude", "gemini", "codex", "aider"] as AdapterType[]);
    return checkAdapters(agentTypes);
  }

  /**
   * Get list of supported agent types
   */
  getSupportedAgentTypes(): CodingAgentType[] {
    return ["shell", "claude", "gemini", "codex", "aider"];
  }

  /**
   * Register a callback for session events
   */
  onSessionEvent(callback: SessionEventCallback): void {
    this.eventCallbacks.push(callback);
  }

  /**
   * Register a custom adapter for new agent types (Node PTYManager only)
   * Adapters in the Bun worker are pre-registered
   */
  registerAdapter(adapter: unknown): void {
    if (!this.manager) {
      throw new Error("PTYService not initialized");
    }

    if (this.usingBunWorker) {
      this.log("registerAdapter not available with Bun worker - adapters must be in the worker");
      return;
    }

    (this.manager as PTYManager).registerAdapter(adapter as Parameters<PTYManager["registerAdapter"]>[0]);
    this.log(`Registered adapter`);
  }

  private toSessionInfo(session: SessionHandle | WorkerSessionHandle, workdir?: string): SessionInfo {
    return {
      id: session.id,
      name: session.name,
      agentType: session.type,
      workdir: workdir ?? process.cwd(),
      status: session.status,
      createdAt: session.startedAt ? new Date(session.startedAt) : new Date(),
      lastActivityAt: session.lastActivityAt ? new Date(session.lastActivityAt) : new Date(),
      metadata: this.sessionMetadata.get(session.id),
    };
  }

  private emitEvent(sessionId: string, event: string, data: unknown): void {
    for (const callback of this.eventCallbacks) {
      try {
        callback(sessionId, event, data);
      } catch (err) {
        this.log(`Event callback error: ${err}`);
      }
    }
  }

  private log(message: string): void {
    if (this.serviceConfig.debug) {
      console.log(`[PTYService] ${message}`);
    }
  }
}
