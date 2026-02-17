import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createWorkspaceProvider,
  truncate,
  buildContext,
  buildCodingAgentSummary,
} from "./workspace-provider.js";
import type { IAgentRuntime, Memory, State } from "@elizaos/core";
import type { WorkspaceBootstrapFile } from "./workspace.js";
import type { CodingAgentContext } from "../services/coding-agent-context.js";

// Mock dependencies
vi.mock("@elizaos/core", () => ({
  logger: {
    warn: vi.fn(),
  },
}));

vi.mock("./workspace.js", async () => {
  const actual = await vi.importActual("./workspace.js");
  return {
    ...actual,
    loadWorkspaceBootstrapFiles: vi.fn(),
    filterBootstrapFilesForSession: vi.fn((files) => files),
    DEFAULT_AGENT_WORKSPACE_DIR: "/default/workspace",
  };
});

// Import mocked functions to control them in tests
import { loadWorkspaceBootstrapFiles, filterBootstrapFilesForSession } from "./workspace.js";

describe("truncate", () => {
  it("returns content as is if length <= max", () => {
    expect(truncate("hello", 10)).toBe("hello");
    expect(truncate("hello", 5)).toBe("hello");
  });

  it("truncates content if length > max", () => {
    const result = truncate("hello world", 5);
    expect(result).toContain("hello");
    expect(result).not.toContain("world");
    expect(result).toContain("[... truncated at 5 chars]");
  });
});

describe("buildContext", () => {
  it("builds context string from files", () => {
    const files: WorkspaceBootstrapFile[] = [
      { name: "file1.txt", path: "/p/file1.txt", missing: false, content: "content1" },
      { name: "file2.txt", path: "/p/file2.txt", missing: false, content: "content2" },
    ];
    const result = buildContext(files, 100);
    expect(result).toContain("## Project Context (Workspace)");
    expect(result).toContain("### file1.txt");
    expect(result).toContain("content1");
    expect(result).toContain("### file2.txt");
    expect(result).toContain("content2");
  });

  it("skips missing or empty files", () => {
    const files: WorkspaceBootstrapFile[] = [
      { name: "missing.txt", path: "/p/missing.txt", missing: true },
      { name: "empty.txt", path: "/p/empty.txt", missing: false, content: "   " },
      { name: "valid.txt", path: "/p/valid.txt", missing: false, content: "valid" },
    ];
    const result = buildContext(files, 100);
    expect(result).toContain("### valid.txt");
    expect(result).not.toContain("missing.txt");
    expect(result).not.toContain("empty.txt");
  });

  it("respects maxChars per file", () => {
    const files: WorkspaceBootstrapFile[] = [
      { name: "long.txt", path: "/p/long.txt", missing: false, content: "1234567890" },
    ];
    const result = buildContext(files, 5);
    expect(result).toContain("12345");
    expect(result).toContain("[TRUNCATED]");
  });
});

describe("buildCodingAgentSummary", () => {
  it("builds summary from context", () => {
    const ctx: CodingAgentContext = {
      sessionId: "session-1",
      taskDescription: "Do something",
      workingDirectory: "/work",
      connector: { type: "local", available: true },
      interactionMode: "auto",
      iterations: [
        {
          id: 1,
          startedAt: 1000,
          errors: [],
          commandResults: [],
        },
      ],
      maxIterations: 5,
      active: true,
      allFeedback: [],
      filesModified: [],
      filesRead: [],
    };

    const summary = buildCodingAgentSummary(ctx);
    expect(summary).toContain("## Coding Agent Session");
    expect(summary).toContain("**Task:** Do something");
    expect(summary).toContain("**Iterations:** 1 / 5");
  });

  it("includes errors from last iteration", () => {
    const ctx: CodingAgentContext = {
      sessionId: "session-1",
      taskDescription: "Task",
      workingDirectory: "/work",
      connector: { type: "local", available: true },
      interactionMode: "auto",
      iterations: [
        {
          id: 1,
          startedAt: 1000,
          errors: [{ category: "lint", message: "Lint error", filePath: "file.ts", line: 10 }],
          commandResults: [],
        },
      ],
      maxIterations: 5,
      active: true,
      allFeedback: [],
      filesModified: [],
      filesRead: [],
    };

    const summary = buildCodingAgentSummary(ctx);
    expect(summary).toContain("Errors to Resolve");
    expect(summary).toContain("[lint]");
    expect(summary).toContain("file.ts:10");
    expect(summary).toContain("Lint error");
  });

  it("includes pending feedback", () => {
    const ctx: CodingAgentContext = {
      sessionId: "session-1",
      taskDescription: "Task",
      workingDirectory: "/work",
      connector: { type: "local", available: true },
      interactionMode: "auto",
      iterations: [
        {
          id: 1,
          startedAt: 1000,
          errors: [],
          commandResults: [],
        },
      ],
      maxIterations: 5,
      active: true,
      allFeedback: [
        { timestamp: 2000, type: "user", text: "Fix this" }, // After iteration start (1000)
        { timestamp: 500, type: "user", text: "Old feedback" }, // Before iteration start
      ],
      filesModified: [],
      filesRead: [],
    };

    const summary = buildCodingAgentSummary(ctx);
    expect(summary).toContain("Human Feedback");
    expect(summary).toContain("Fix this");
    expect(summary).not.toContain("Old feedback");
  });
});

describe("createWorkspaceProvider", () => {
  const runtime = {} as IAgentRuntime;
  const state = {} as State;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns provider with correct name", () => {
    const provider = createWorkspaceProvider();
    expect(provider.name).toBe("workspaceContext");
  });

  it("get() returns context from files", async () => {
    const provider = createWorkspaceProvider();
    const message = { metadata: {} } as Memory;

    const mockFiles: WorkspaceBootstrapFile[] = [
      { name: "test.txt", path: "/path", missing: false, content: "test content" },
    ];
    (loadWorkspaceBootstrapFiles as any).mockResolvedValue(mockFiles);

    const result = await provider.get(runtime, message, state);

    expect(loadWorkspaceBootstrapFiles).toHaveBeenCalledWith("/default/workspace"); // Default dir
    expect(result?.text).toContain("test content");
    expect(result?.data).toEqual({ workspaceDir: "/default/workspace" });
  });

  it("get() uses configured workspace dir", async () => {
    const provider = createWorkspaceProvider({ workspaceDir: "/custom/dir" });
    const message = { metadata: {} } as Memory;
    (loadWorkspaceBootstrapFiles as any).mockResolvedValue([]);

    await provider.get(runtime, message, state);

    expect(loadWorkspaceBootstrapFiles).toHaveBeenCalledWith("/custom/dir");
  });

  it("get() filters files for session", async () => {
    const provider = createWorkspaceProvider();
    const message = { metadata: { sessionKey: "subagent:123" } } as Memory;
    (loadWorkspaceBootstrapFiles as any).mockResolvedValue([]);

    await provider.get(runtime, message, state);

    expect(filterBootstrapFilesForSession).toHaveBeenCalledWith(expect.any(Array), "subagent:123");
  });

  it("get() enriches with coding agent context if present", async () => {
    const provider = createWorkspaceProvider();
    const codingCtx = {
      sessionId: "session-1",
      taskDescription: "Code something",
      // Add required fields to pass duck-typing
      workingDirectory: "/",
      connector: { type: "local", available: true },
      interactionMode: "auto",
      iterations: [],
      maxIterations: 1,
      active: true,
      allFeedback: [],
      filesModified: [],
      filesRead: [],
    };
    const message = {
      metadata: {
        codingAgentContext: codingCtx,
      },
    } as unknown as Memory;

    (loadWorkspaceBootstrapFiles as any).mockResolvedValue([]);

    const result = await provider.get(runtime, message, state);

    expect(result?.text).toContain("Coding Agent Session");
    expect(result?.text).toContain("Code something");
    expect(result?.data).toEqual({
      workspaceDir: "/default/workspace",
      codingSession: "session-1",
    });
  });

  it("get() handles errors gracefully", async () => {
    // Use a unique directory to bypass the internal cache
    const provider = createWorkspaceProvider({ workspaceDir: "/error/dir" });
    const message = { metadata: {} } as Memory;

    (loadWorkspaceBootstrapFiles as any).mockRejectedValue(new Error("File error"));

    const result = await provider.get(runtime, message, state);

    expect(loadWorkspaceBootstrapFiles).toHaveBeenCalledWith("/error/dir");
    expect(result?.text).toContain("Workspace context unavailable: File error");
  });
});
