import { describe, it, expect, vi, afterEach } from "vitest";
import {
  truncate,
  buildContext,
  buildCodingAgentSummary,
  createWorkspaceProvider,
  _resetCacheForTest,
} from "./workspace-provider.js";
import {
  type WorkspaceBootstrapFile,
  type WorkspaceBootstrapFileName,
} from "./workspace.js";
import type { CodingAgentContext } from "../services/coding-agent-context.js";
import type { IAgentRuntime, Memory, State } from "@elizaos/core";

const { mockLoadWorkspaceBootstrapFiles, mockFilterBootstrapFilesForSession } =
  vi.hoisted(() => {
    return {
      mockLoadWorkspaceBootstrapFiles: vi.fn(),
      mockFilterBootstrapFilesForSession: vi.fn(),
    };
  });

vi.mock("./workspace.js", () => {
  return {
    DEFAULT_AGENT_WORKSPACE_DIR: "/mock/workspace",
    loadWorkspaceBootstrapFiles: mockLoadWorkspaceBootstrapFiles,
    filterBootstrapFilesForSession: mockFilterBootstrapFilesForSession,
  };
});

vi.mock("@elizaos/core", () => {
  return {
    logger: {
      warn: vi.fn(),
    },
  };
});

describe("workspace-provider", () => {
  afterEach(() => {
    _resetCacheForTest();
    vi.clearAllMocks();
  });

  describe("truncate", () => {
    it("should return content as is if length is within max", () => {
      const content = "hello world";
      expect(truncate(content, 20)).toBe(content);
    });

    it("should truncate content if length exceeds max", () => {
      const content = "hello world";
      const result = truncate(content, 5);
      expect(result).toContain("hello");
      expect(result).toContain("[... truncated at 5 chars]");
    });
  });

  describe("buildContext", () => {
    it("should build context from files", () => {
      const files: WorkspaceBootstrapFile[] = [
        {
          name: "AGENTS.md" as WorkspaceBootstrapFileName,
          path: "/path/AGENTS.md",
          content: "agent content",
          missing: false,
        },
      ];
      const context = buildContext(files, 100);
      expect(context).toContain("### AGENTS.md");
      expect(context).toContain("agent content");
    });

    it("should skip missing or empty files", () => {
      const files: WorkspaceBootstrapFile[] = [
        {
          name: "AGENTS.md" as WorkspaceBootstrapFileName,
          path: "/path/AGENTS.md",
          content: "",
          missing: false,
        },
        {
          name: "TOOLS.md" as WorkspaceBootstrapFileName,
          path: "/path/TOOLS.md",
          content: "tools content",
          missing: true,
        },
      ];
      const context = buildContext(files, 100);
      expect(context).toBe("");
    });
  });

  describe("buildCodingAgentSummary", () => {
    it("should build summary correctly", () => {
      const ctx: CodingAgentContext = {
        sessionId: "session-1",
        taskDescription: "test task",
        workingDirectory: "/work",
        connector: { type: "local-fs", basePath: "/base", available: true },
        interactionMode: "fully-automated",
        maxIterations: 5,
        active: true,
        iterations: [],
        allFeedback: [],
        createdAt: 100,
        updatedAt: 100,
      };
      const summary = buildCodingAgentSummary(ctx);
      expect(summary).toContain("**Task:** test task");
      expect(summary).toContain("**Working Directory:** /work");
      expect(summary).toContain("**Active:** yes");
    });
  });

  describe("createWorkspaceProvider", () => {
    it("should return provider with get method", () => {
      const provider = createWorkspaceProvider();
      expect(provider.name).toBe("workspaceContext");
      expect(provider.get).toBeDefined();
    });

    it("should call loadWorkspaceBootstrapFiles and filterBootstrapFilesForSession", async () => {
      mockLoadWorkspaceBootstrapFiles.mockResolvedValue([]);
      mockFilterBootstrapFilesForSession.mockReturnValue([]);

      const provider = createWorkspaceProvider();
      await provider.get(
        {} as IAgentRuntime,
        { metadata: {} } as Memory,
        {} as State,
      );

      expect(mockLoadWorkspaceBootstrapFiles).toHaveBeenCalledWith(
        "/mock/workspace",
      );
      expect(mockFilterBootstrapFilesForSession).toHaveBeenCalled();
    });

    it("should use cached files if available", async () => {
        mockLoadWorkspaceBootstrapFiles.mockResolvedValue([]);
        mockFilterBootstrapFilesForSession.mockReturnValue([]);

        const provider = createWorkspaceProvider();
        await provider.get(
          {} as IAgentRuntime,
          { metadata: {} } as Memory,
          {} as State,
        );
        await provider.get(
            {} as IAgentRuntime,
            { metadata: {} } as Memory,
            {} as State,
        );

        expect(mockLoadWorkspaceBootstrapFiles).toHaveBeenCalledTimes(1);
    });
  });
});
