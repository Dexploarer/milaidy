import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  _resetCacheForTest,
  buildCodingAgentSummary,
  buildContext,
  createWorkspaceProvider,
  truncate,
} from "./workspace-provider.js";

// Hoist mocks
const { mockLoadWorkspaceBootstrapFiles, mockFilterBootstrapFilesForSession, mockLogger } = vi.hoisted(() => {
  return {
    mockLoadWorkspaceBootstrapFiles: vi.fn(),
    mockFilterBootstrapFilesForSession: vi.fn(),
    mockLogger: {
      warn: vi.fn(),
      info: vi.fn(),
      error: vi.fn(),
    },
  };
});

vi.mock("./workspace.js", () => ({
  DEFAULT_AGENT_WORKSPACE_DIR: "/mock/workspace",
  loadWorkspaceBootstrapFiles: (...args: any[]) =>
    mockLoadWorkspaceBootstrapFiles(...args),
  filterBootstrapFilesForSession: (...args: any[]) =>
    mockFilterBootstrapFilesForSession(...args),
}));

vi.mock("@elizaos/core", () => ({
  logger: mockLogger,
}));

describe("workspace-provider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetCacheForTest();
  });

  afterEach(() => {
    _resetCacheForTest();
  });

  describe("truncate", () => {
    it("returns original content if within limit", () => {
      expect(truncate("hello", 10)).toBe("hello");
    });

    it("truncates content if exceeding limit", () => {
      const result = truncate("hello world", 5);
      expect(result).toContain("hello");
      expect(result).toContain("truncated at 5 chars");
      expect(result.length).toBeGreaterThan(5);
    });
  });

  describe("buildContext", () => {
    it("returns empty string for no files", () => {
      expect(buildContext([], 100)).toBe("");
    });

    it("formats a single file correctly", () => {
      const files = [
        {
          name: "AGENTS.md" as const,
          path: "/path/to/AGENTS.md",
          content: "agent content",
          missing: false,
        },
      ];
      const result = buildContext(files, 100);
      expect(result).toContain("## Project Context (Workspace)");
      expect(result).toContain("### AGENTS.md");
      expect(result).toContain("agent content");
    });

    it("skips missing or empty files", () => {
      const files = [
        {
          name: "AGENTS.md" as const,
          path: "/path/to/AGENTS.md",
          content: "",
          missing: false,
        },
        {
          name: "TOOLS.md" as const,
          path: "/path/to/TOOLS.md",
          missing: true,
        },
      ];
      expect(buildContext(files, 100)).toBe("");
    });

    it("truncates individual file content", () => {
      const files = [
        {
          name: "AGENTS.md" as const,
          path: "/path/to/AGENTS.md",
          content: "looooong content",
          missing: false,
        },
      ];
      const result = buildContext(files, 5);
      expect(result).toContain("loooo");
      expect(result).toContain("[TRUNCATED]");
    });

    it("respects total char limit", () => {
      const hugeContent = "a".repeat(100005);
      const files = [
        {
          name: "FILE1.md" as const,
          path: "/f1",
          content: hugeContent,
          missing: false,
        },
        {
          name: "FILE2.md" as const,
          path: "/f2",
          content: "should not be included",
          missing: false,
        },
      ];

      const result = buildContext(files, 200000);
      expect(result).toContain("FILE1.md");
      expect(result).not.toContain("FILE2.md");
    });
  });

  describe("buildCodingAgentSummary", () => {
    it("generates summary with basic info", () => {
      const ctx: any = {
        taskDescription: "Fix bugs",
        workingDirectory: "/tmp",
        connector: { type: "local", available: true },
        interactionMode: "auto",
        iterations: [],
        maxIterations: 5,
        active: true,
        allFeedback: [],
      };
      const summary = buildCodingAgentSummary(ctx);
      expect(summary).toContain("**Task:** Fix bugs");
      expect(summary).toContain("**Working Directory:** /tmp");
      expect(summary).toContain("**Active:** yes");
    });

    it("includes errors from last iteration", () => {
      const ctx: any = {
        taskDescription: "Fix bugs",
        workingDirectory: "/tmp",
        connector: { type: "local", available: true },
        interactionMode: "auto",
        iterations: [
          {
            errors: [
              {
                category: "compile",
                filePath: "src/index.ts",
                line: 10,
                message: "Syntax error",
              },
            ],
            commandResults: [],
          },
        ],
        maxIterations: 5,
        active: true,
        allFeedback: [],
      };
      const summary = buildCodingAgentSummary(ctx);
      expect(summary).toContain("### Errors to Resolve");
      expect(summary).toContain("src/index.ts:10");
      expect(summary).toContain("Syntax error");
    });

    it("includes pending feedback", () => {
      const ctx: any = {
        taskDescription: "Fix bugs",
        workingDirectory: "/tmp",
        connector: { type: "local", available: true },
        interactionMode: "auto",
        iterations: [
            {
                startedAt: 1000,
                errors: [],
                commandResults: [],
            }
        ],
        maxIterations: 5,
        active: true,
        allFeedback: [
          {
            type: "correction",
            text: "Fix typo",
            timestamp: 2000, // after iteration started
          },
        ],
      };
      const summary = buildCodingAgentSummary(ctx);
      expect(summary).toContain("### Human Feedback");
      expect(summary).toContain("[correction]: Fix typo");
    });
  });

  describe("createWorkspaceProvider", () => {
    it("returns a provider", () => {
      const provider = createWorkspaceProvider();
      expect(provider.name).toBe("workspaceContext");
      expect(typeof provider.get).toBe("function");
    });

    it("loads and filters files", async () => {
      const files = [
        {
          name: "AGENTS.md",
          path: "path",
          content: "content",
          missing: false,
        },
      ];
      mockLoadWorkspaceBootstrapFiles.mockResolvedValue(files);
      mockFilterBootstrapFilesForSession.mockReturnValue(files);

      const provider = createWorkspaceProvider();
      const result = await provider.get(
        {} as any,
        { metadata: { sessionKey: "key" } } as any,
        {} as any
      );

      expect(mockLoadWorkspaceBootstrapFiles).toHaveBeenCalledWith(
        "/mock/workspace"
      );
      expect(mockFilterBootstrapFilesForSession).toHaveBeenCalledWith(
        files,
        "key"
      );
      expect(result.text).toContain("content");
    });

    it("uses caching", async () => {
      const files = [
        {
          name: "AGENTS.md",
          path: "path",
          content: "content",
          missing: false,
        },
      ];
      mockLoadWorkspaceBootstrapFiles.mockResolvedValue(files);
      mockFilterBootstrapFilesForSession.mockReturnValue(files);

      const provider = createWorkspaceProvider();

      // First call
      await provider.get({} as any, { metadata: {} } as any, {} as any);
      expect(mockLoadWorkspaceBootstrapFiles).toHaveBeenCalledTimes(1);

      // Second call (should use cache)
      await provider.get({} as any, { metadata: {} } as any, {} as any);
      expect(mockLoadWorkspaceBootstrapFiles).toHaveBeenCalledTimes(1);
    });

    it("handles errors gracefully", async () => {
      mockLoadWorkspaceBootstrapFiles.mockRejectedValue(new Error("Disk error"));

      const provider = createWorkspaceProvider();
      const result = await provider.get(
        {} as any,
        { metadata: {} } as any,
        {} as any
      );

      expect(result.text).toContain("Workspace context unavailable");
      expect(result.text).toContain("Disk error");
      expect(mockLogger.warn).toHaveBeenCalled();
    });

    it("enriches with coding agent context if present", async () => {
       const files = [];
       mockLoadWorkspaceBootstrapFiles.mockResolvedValue(files);
       mockFilterBootstrapFilesForSession.mockReturnValue(files);

       const codingCtx = {
           sessionId: "session-123",
           taskDescription: "coding task",
           workingDirectory: "/wd",
           connector: { type: "local", available: true },
           interactionMode: "auto",
           iterations: [],
           maxIterations: 5,
           active: true,
           allFeedback: []
       };

       const provider = createWorkspaceProvider();
       const result = await provider.get(
           {} as any,
           {
               metadata: {
                   codingAgentContext: codingCtx
               }
           } as any,
           {} as any
       );

       expect(result.text).toContain("## Coding Agent Session");
       expect(result.text).toContain("coding task");
       expect(result.data).toHaveProperty("codingSession", "session-123");
    });
  });
});
