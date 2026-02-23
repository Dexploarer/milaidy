import { describe, it, expect, vi, beforeEach } from "vitest";
import type { WorkspaceBootstrapFile } from "./workspace";
import type { CodingAgentContext } from "../services/coding-agent-context";

const { mockLoadFiles, mockFilterFiles, mockDefaultDir } = vi.hoisted(() => {
  return {
    mockLoadFiles: vi.fn(),
    mockFilterFiles: vi.fn((files) => files),
    mockDefaultDir: "/default/workspace",
  };
});

// Mock ./workspace.js
vi.mock("./workspace", () => ({
  loadWorkspaceBootstrapFiles: (...args: any[]) => mockLoadFiles(...args),
  filterBootstrapFilesForSession: (...args: any[]) => mockFilterFiles(...args),
  DEFAULT_AGENT_WORKSPACE_DIR: mockDefaultDir,
}));

// Mock logger
vi.mock("@elizaos/core", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@elizaos/core")>();
    return {
        ...actual,
        logger: {
            warn: vi.fn(),
            log: vi.fn(),
            error: vi.fn(),
        }
    };
});

import {
  truncate,
  buildContext,
  buildCodingAgentSummary,
  createWorkspaceProvider,
} from "./workspace-provider";

describe("src/providers/workspace-provider.ts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFilterFiles.mockImplementation((f: any) => f);
  });

  describe("truncate", () => {
    it("should return content if length is within max", () => {
      expect(truncate("hello", 10)).toBe("hello");
    });

    it("should truncate content if length exceeds max", () => {
      expect(truncate("hello world", 5)).toBe("hello\n\n[... truncated at 5 chars]");
    });
  });

  describe("buildContext", () => {
    it("should build context from files", () => {
      const files: WorkspaceBootstrapFile[] = [
        { name: "AGENTS.md", path: "/path/AGENTS.md", content: "agent content", missing: false },
        { name: "TOOLS.md", path: "/path/TOOLS.md", content: "tools content", missing: false },
      ] as any;
      const context = buildContext(files, 100);
      expect(context).toContain("### AGENTS.md");
      expect(context).toContain("agent content");
      expect(context).toContain("### TOOLS.md");
      expect(context).toContain("tools content");
    });

    it("should skip missing or empty files", () => {
      const files: WorkspaceBootstrapFile[] = [
        { name: "AGENTS.md", path: "/path", missing: true },
        { name: "TOOLS.md", path: "/path", content: "   ", missing: false },
      ] as any;
      const context = buildContext(files, 100);
      expect(context).toBe("");
    });

    it("should respect max chars per file", () => {
       const files: WorkspaceBootstrapFile[] = [
        { name: "AGENTS.md", path: "/path", content: "long content", missing: false },
      ] as any;
      const context = buildContext(files, 4);
      expect(context).toContain("long\n\n[... truncated");
      expect(context).toContain("### AGENTS.md [TRUNCATED]");
    });
  });

  describe("buildCodingAgentSummary", () => {
     it("should build summary", () => {
         const ctx = {
             taskDescription: "Fix bugs",
             workingDirectory: "/work",
             connector: { type: "local", available: true },
             interactionMode: "autonomous",
             iterations: [],
             active: true,
             maxIterations: 10,
             allFeedback: [],
         } as unknown as CodingAgentContext;

         const summary = buildCodingAgentSummary(ctx);
         expect(summary).toContain("**Task:** Fix bugs");
         expect(summary).toContain("**Working Directory:** /work");
     });

     it("should include errors from last iteration", () => {
         const ctx = {
             taskDescription: "Fix bugs",
             workingDirectory: "/work",
             connector: { type: "local", available: true },
             interactionMode: "autonomous",
             active: true,
             maxIterations: 10,
             allFeedback: [],
             iterations: [
                 {
                     startedAt: 100,
                     errors: [
                         { category: "test", message: "Test failed", filePath: "test.ts", line: 10 }
                     ],
                     commandResults: [],
                 }
             ],
         } as unknown as CodingAgentContext;

         const summary = buildCodingAgentSummary(ctx);
         expect(summary).toContain("### Errors to Resolve");
         expect(summary).toContain("- [test] at test.ts:10: Test failed");
     });
  });

  describe("createWorkspaceProvider", () => {
      it("should return provider", async () => {
          const provider = createWorkspaceProvider();
          expect(provider.name).toBe("workspaceContext");
      });

      it("should call loadWorkspaceBootstrapFiles with correct dir", async () => {
          const provider = createWorkspaceProvider();
          mockLoadFiles.mockResolvedValue([]);

          await provider.get({} as any, { metadata: {} } as any, {} as any);

          expect(mockLoadFiles).toHaveBeenCalledWith(mockDefaultDir);
      });

      it("should call loadWorkspaceBootstrapFiles with custom dir", async () => {
          const provider = createWorkspaceProvider({ workspaceDir: "/custom" });
          mockLoadFiles.mockResolvedValue([]);

          await provider.get({} as any, { metadata: {} } as any, {} as any);

          expect(mockLoadFiles).toHaveBeenCalledWith("/custom");
      });

      it("should filter files based on session key", async () => {
          const provider = createWorkspaceProvider();
          mockLoadFiles.mockResolvedValue([]);

          await provider.get({} as any, { metadata: { sessionKey: "subagent-1" } } as any, {} as any);

          expect(mockFilterFiles).toHaveBeenCalledWith([], "subagent-1");
      });

      it("should include coding agent summary if context present", async () => {
           const provider = createWorkspaceProvider();
           mockLoadFiles.mockResolvedValue([]);

           const codingCtx = {
             sessionId: "session-1",
             taskDescription: "Task",
             workingDirectory: "/wd",
             connector: { type: "local", available: true },
             interactionMode: "auto",
             iterations: [],
             active: true,
             maxIterations: 5,
             allFeedback: [],
           };

           const message = {
               metadata: {
                   codingAgentContext: codingCtx
               }
           };

           const result = await provider.get({} as any, message as any, {} as any);
           // @ts-ignore
           expect(result?.text).toContain("## Coding Agent Session");
           // @ts-ignore
           expect(result?.text).toContain("**Task:** Task");
      });
  });
});
