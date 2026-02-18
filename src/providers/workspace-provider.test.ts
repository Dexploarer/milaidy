import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  truncate,
  buildContext,
  createWorkspaceProvider,
  buildCodingAgentSummary,
} from "./workspace-provider";
import * as workspace from "./workspace";
import type { WorkspaceBootstrapFile } from "./workspace";
import { type IAgentRuntime, type Memory, type State } from "@elizaos/core";

// Mock the workspace module
vi.mock("./workspace", async (importOriginal) => {
  const actual = await importOriginal<typeof workspace>();
  return {
    ...actual,
    loadWorkspaceBootstrapFiles: vi.fn(),
    filterBootstrapFilesForSession: vi.fn(),
    DEFAULT_AGENT_WORKSPACE_DIR: "/mock/workspace/dir",
  };
});

// Mock logger to avoid console spam during error tests
vi.mock("@elizaos/core", async (importOriginal) => {
    const actual = await importOriginal<any>();
    return {
        ...actual,
        logger: {
            warn: vi.fn(),
            info: vi.fn(),
            error: vi.fn(),
            log: vi.fn(),
        }
    };
});

describe("workspace-provider", () => {
  describe("truncate", () => {
    it("should return content as is if length is within max", () => {
      const content = "hello world";
      expect(truncate(content, 20)).toBe(content);
    });

    it("should truncate content if it exceeds max", () => {
      const content = "hello world";
      const max = 5;
      const expected = "hello\n\n[... truncated at 5 chars]";
      expect(truncate(content, max)).toBe(expected);
    });
  });

  describe("buildContext", () => {
    it("should return empty string for empty files", () => {
      expect(buildContext([], 100)).toBe("");
    });

    it("should format files correctly", () => {
      const files: WorkspaceBootstrapFile[] = [
        { name: "AGENTS.md", path: "p1", content: "agent content", missing: false },
        { name: "TOOLS.md", path: "p2", content: "tools content", missing: false },
      ];
      const context = buildContext(files, 100);
      expect(context).toContain("### AGENTS.md");
      expect(context).toContain("agent content");
      expect(context).toContain("### TOOLS.md");
      expect(context).toContain("tools content");
    });

    it("should skip missing or empty files", () => {
      const files: WorkspaceBootstrapFile[] = [
        { name: "AGENTS.md", path: "p1", content: "", missing: false },
        { name: "TOOLS.md", path: "p2", content: "tools content", missing: false },
        { name: "IDENTITY.md", path: "p3", missing: true },
      ];
      const context = buildContext(files, 100);
      expect(context).not.toContain("AGENTS.md");
      expect(context).toContain("### TOOLS.md");
      expect(context).not.toContain("IDENTITY.md");
    });

    it("should respect max chars truncation per file", () => {
      const files: WorkspaceBootstrapFile[] = [
        { name: "AGENTS.md", path: "p1", content: "long content here", missing: false },
      ];
      const context = buildContext(files, 5);
      expect(context).toContain("long \n\n[... truncated");
      expect(context).toContain("### AGENTS.md [TRUNCATED]");
    });

    it("should stop adding files if total max chars is reached (internal hard cap 100_000)", () => {
        // Create a large string
        const largeContent = "a".repeat(60000);
        const files: WorkspaceBootstrapFile[] = [
            { name: "AGENTS.md", path: "p1", content: largeContent, missing: false },
            { name: "TOOLS.md", path: "p2", content: largeContent, missing: false },
        ];

        // Pass a large per-file limit so truncation doesn't happen at the file level
        const context = buildContext(files, 200000);

        // First file (60k) + header should be included
        expect(context).toContain("### AGENTS.md");
        // Second file (60k) would make total > 120k, which exceeds 100k limit.
        // So it should be skipped.
        expect(context).not.toContain("### TOOLS.md");
    });
  });

  describe("buildCodingAgentSummary", () => {
      it("should build summary correctly", () => {
          const ctx: any = {
              taskDescription: "Fix bugs",
              workingDirectory: "/src",
              connector: { type: "local", available: true },
              interactionMode: "autonomous",
              iterations: [],
              maxIterations: 5,
              active: true,
              allFeedback: [],
          };
          const summary = buildCodingAgentSummary(ctx);
          expect(summary).toContain("## Coding Agent Session");
          expect(summary).toContain("**Task:** Fix bugs");
          expect(summary).toContain("**Working Directory:** /src");
          expect(summary).toContain("**Connector:** local (available)");
          expect(summary).toContain("**Mode:** autonomous");
      });

      it("should include recent errors", () => {
        const ctx: any = {
            taskDescription: "Fix bugs",
            workingDirectory: "/src",
            connector: { type: "local", available: true },
            interactionMode: "autonomous",
            iterations: [{
                startedAt: 100,
                errors: [{ category: "TEST", message: "Error occurred", filePath: "file.ts", line: 10 }],
                commandResults: []
            }],
            maxIterations: 5,
            active: true,
            allFeedback: [],
        };
        const summary = buildCodingAgentSummary(ctx);
        expect(summary).toContain("### Errors to Resolve");
        expect(summary).toContain("[TEST] at file.ts:10: Error occurred");
      });

      it("should include pending feedback", () => {
        const ctx: any = {
            taskDescription: "Fix bugs",
            workingDirectory: "/src",
            connector: { type: "local", available: true },
            interactionMode: "autonomous",
            iterations: [{
                startedAt: 100,
                errors: [],
                commandResults: []
            }],
            maxIterations: 5,
            active: true,
            allFeedback: [{ type: "human", text: "Good job", timestamp: 200 }],
        };
        const summary = buildCodingAgentSummary(ctx);
        expect(summary).toContain("### Human Feedback");
        expect(summary).toContain("[human]: Good job");
      });
  });

  describe("createWorkspaceProvider", () => {
      const mockLoadWorkspaceBootstrapFiles = workspace.loadWorkspaceBootstrapFiles as any;
      const mockFilterBootstrapFilesForSession = workspace.filterBootstrapFilesForSession as any;

      beforeEach(() => {
          vi.clearAllMocks();
          mockFilterBootstrapFilesForSession.mockImplementation((files: any) => files);
      });

      it("should return provider with correct name", () => {
          const provider = createWorkspaceProvider();
          expect(provider.name).toBe("workspaceContext");
      });

      it("should load files and return context", async () => {
          const files: WorkspaceBootstrapFile[] = [
              { name: "AGENTS.md", path: "p1", content: "content", missing: false }
          ];
          mockLoadWorkspaceBootstrapFiles.mockResolvedValue(files);

          const provider = createWorkspaceProvider();
          const result = await provider.get({} as IAgentRuntime, { metadata: {} } as Memory, {} as State);

          expect(result?.text).toContain("### AGENTS.md");
          expect(workspace.loadWorkspaceBootstrapFiles).toHaveBeenCalled();
      });

      it("should use cached files if called within TTL", async () => {
          const files: WorkspaceBootstrapFile[] = [
              { name: "AGENTS.md", path: "p1", content: "content", missing: false }
          ];
          mockLoadWorkspaceBootstrapFiles.mockResolvedValue(files);

          // Use a unique directory for this test to ensure cache isolation
          const uniqueDir = "/unique/dir/" + Math.random();
          const provider = createWorkspaceProvider({ workspaceDir: uniqueDir });

          await provider.get({} as IAgentRuntime, { metadata: {} } as Memory, {} as State);
          await provider.get({} as IAgentRuntime, { metadata: {} } as Memory, {} as State);

          expect(workspace.loadWorkspaceBootstrapFiles).toHaveBeenCalledTimes(1);
          expect(workspace.loadWorkspaceBootstrapFiles).toHaveBeenCalledWith(uniqueDir);
      });

      it("should extract coding agent context", async () => {
           const files: WorkspaceBootstrapFile[] = [];
           mockLoadWorkspaceBootstrapFiles.mockResolvedValue(files);

           const codingCtx = {
              sessionId: "session-1",
              taskDescription: "Fix bugs",
              workingDirectory: "/src",
              connector: { type: "local", available: true },
              interactionMode: "autonomous",
              iterations: [],
              maxIterations: 5,
              active: true,
              allFeedback: [],
           };

           const provider = createWorkspaceProvider();
           const result = await provider.get({} as IAgentRuntime, {
               metadata: { codingAgentContext: codingCtx }
           } as Memory, {} as State);

           expect(result?.text).toContain("## Coding Agent Session");
           expect(result?.data?.codingSession).toBe("session-1");
      });

      it("should handle load errors gracefully", async () => {
          mockLoadWorkspaceBootstrapFiles.mockRejectedValue(new Error("File system error"));

          // Use a unique dir to bypass cache from previous tests
          const uniqueDir = "/unique/error/dir/" + Math.random();
          const provider = createWorkspaceProvider({ workspaceDir: uniqueDir });
          const result = await provider.get({} as IAgentRuntime, { metadata: {} } as Memory, {} as State);

          expect(result?.text).toContain("Workspace context unavailable");
          expect(result?.text).toContain("File system error");
      });
  });
});
