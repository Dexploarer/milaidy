import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  _resetCacheForTest,
  buildCodingAgentSummary,
  buildContext,
  createWorkspaceProvider,
  truncate,
} from "./workspace-provider.js";
import {
  filterBootstrapFilesForSession,
  loadWorkspaceBootstrapFiles,
} from "./workspace.js";
import { logger } from "@elizaos/core";
import type { CodingAgentContext } from "../services/coding-agent-context.js";

// Mock dependencies
vi.mock("@elizaos/core", () => ({
  logger: {
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  },
  isSubagentSessionKey: vi.fn(),
}));

vi.mock("./workspace.js", () => ({
  DEFAULT_AGENT_WORKSPACE_DIR: "/mock/workspace",
  loadWorkspaceBootstrapFiles: vi.fn(),
  filterBootstrapFilesForSession: vi.fn(),
}));

describe("workspace-provider", () => {
  afterEach(() => {
    _resetCacheForTest();
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  describe("truncate", () => {
    it("returns content as-is if length <= max", () => {
      expect(truncate("hello", 10)).toBe("hello");
      expect(truncate("hello", 5)).toBe("hello");
    });

    it("truncates content and appends suffix if length > max", () => {
      const result = truncate("hello world", 5);
      expect(result).toContain("hello");
      expect(result).toContain("[... truncated at 5 chars]");
      expect(result.length).toBeGreaterThan(5);
    });
  });

  describe("buildContext", () => {
    const mockFiles = [
      { name: "AGENTS.md", path: "/path/AGENTS.md", content: "Agent content", missing: false },
      { name: "TOOLS.md", path: "/path/TOOLS.md", content: "Tools content", missing: false },
    ];

    it("builds context from files", () => {
      const result = buildContext(mockFiles as any, 100);
      expect(result).toContain("## Project Context (Workspace)");
      expect(result).toContain("### AGENTS.md");
      expect(result).toContain("Agent content");
      expect(result).toContain("### TOOLS.md");
      expect(result).toContain("Tools content");
    });

    it("skips missing or empty files", () => {
      const files = [
        { name: "MISSING.md", path: "/p/m", missing: true },
        { name: "EMPTY.md", path: "/p/e", content: "   ", missing: false },
        { name: "VALID.md", path: "/p/v", content: "valid", missing: false },
      ];
      const result = buildContext(files as any, 100);
      expect(result).toContain("### VALID.md");
      expect(result).not.toContain("MISSING.md");
      expect(result).not.toContain("EMPTY.md");
    });

    it("respects MAX_TOTAL_WORKSPACE_CHARS (soft limit check via truncation)", () => {
      // The function uses a hardcoded limit of 100,000.
      // We can simulate exceeding it by providing many files or large content.
      // Since we can't easily mock the constant without rewiring, we'll just test that it processes files.
      // However, we can test the `truncate` call per file.
      const files = [
        { name: "LARGE.md", path: "/p/l", content: "a".repeat(200), missing: false },
      ];
      const result = buildContext(files as any, 50);
      expect(result).toContain("[... truncated at 50 chars]");
    });

    it("stops adding files if total length exceeds limit", () => {
        // create a file content that is close to the limit
        const limit = 100_000;
        const largeContent = "a".repeat(limit + 100);
        const files = [
            { name: "FILE1.md", path: "/p/1", content: largeContent, missing: false },
            { name: "FILE2.md", path: "/p/2", content: "should be skipped", missing: false },
        ];

        // Use a very large per-file max to ensure the file itself isn't truncated by `truncate`
        // but the loop breaks due to `totalChars`.
        // Wait, `truncate` is called first. If we pass `limit * 2` as maxChars, the file won't be truncated by `truncate`.
        const result = buildContext(files as any, limit * 2);

        expect(result).toContain("FILE1.md");
        // The first file is added.
        // `totalChars` becomes > 100,000.
        // The loop continues to the next file? No, the check is `if (totalChars + section.length > MAX ...)`
        // Actually the check is:
        /*
        const section = ...
        if (totalChars + section.length > MAX_TOTAL_WORKSPACE_CHARS && sections.length > 0) {
            break;
        }
        sections.push(section);
        totalChars += section.length;
        */
        // So if the first file is huge, it IS added (sections.length is 0).
        // Then totalChars is huge.
        // Then next iteration, sections.length > 0, so it should break.

        expect(result).not.toContain("FILE2.md");
        expect(result).not.toContain("should be skipped");
    });
  });

  describe("buildCodingAgentSummary", () => {
    const baseCtx: CodingAgentContext = {
      sessionId: "sess-1",
      taskDescription: "Do something",
      workingDirectory: "/work/dir",
      connector: { type: "local-fs", basePath: "/", available: true },
      interactionMode: "fully-automated",
      maxIterations: 5,
      active: true,
      iterations: [],
      allFeedback: [],
      createdAt: Date.now(),
    };

    it("builds basic summary", () => {
      const result = buildCodingAgentSummary(baseCtx);
      expect(result).toContain("## Coding Agent Session");
      expect(result).toContain("**Task:** Do something");
      expect(result).toContain("**Working Directory:** /work/dir");
      expect(result).toContain("**Iterations:** 0 / 5");
    });

    it("includes errors from last iteration", () => {
      const ctx: CodingAgentContext = {
        ...baseCtx,
        iterations: [
          {
            index: 0,
            startedAt: Date.now(),
            errors: [
              { category: "compile", message: "Syntax error", filePath: "test.ts", line: 10 },
            ],
            fileOperations: [],
            commandResults: [],
            feedback: [],
            selfCorrected: false,
          },
        ],
      };
      const result = buildCodingAgentSummary(ctx);
      expect(result).toContain("### Errors to Resolve");
      expect(result).toContain("[compile] at test.ts:10: Syntax error");
    });

    it("includes pending feedback", () => {
      const start = Date.now();
      const ctx: CodingAgentContext = {
        ...baseCtx,
        iterations: [
          {
            index: 0,
            startedAt: start - 1000,
            errors: [],
            fileOperations: [],
            commandResults: [],
            feedback: [],
            selfCorrected: false,
          },
        ],
        allFeedback: [
           // This one is before the iteration started (should be ignored? logic says: f.timestamp > lastIteration.startedAt)
           // If it's old feedback, it might be ignored if we consider it "addressed".
           // The code filters: return f.timestamp > lastIteration.startedAt;
           { id: "1", timestamp: start + 100, text: "Fix this", type: "correction" },
        ],
      };
      const result = buildCodingAgentSummary(ctx);
      expect(result).toContain("### Human Feedback");
      expect(result).toContain("[correction]: Fix this");
    });

    it("includes recent commands", () => {
        const ctx: CodingAgentContext = {
            ...baseCtx,
            iterations: [
              {
                index: 0,
                startedAt: Date.now(),
                errors: [],
                fileOperations: [],
                commandResults: [
                    { command: "ls", exitCode: 0, stdout: "", stderr: "", executedIn: "/", success: true },
                    { command: "fail", exitCode: 1, stdout: "", stderr: "", executedIn: "/", success: false },
                ],
                feedback: [],
                selfCorrected: false,
              },
            ],
          };
          const result = buildCodingAgentSummary(ctx);
          expect(result).toContain("### Recent Commands");
          expect(result).toContain("`ls` → OK");
          expect(result).toContain("`fail` → FAIL(1)");
    });
  });

  describe("createWorkspaceProvider", () => {
    const mockFiles = [
        { name: "AGENTS.md", path: "/path/AGENTS.md", content: "Agent content", missing: false },
    ];

    beforeEach(() => {
        (loadWorkspaceBootstrapFiles as any).mockResolvedValue(mockFiles);
        (filterBootstrapFilesForSession as any).mockImplementation((files) => files);
    });

    it("returns context with workspace files", async () => {
        const provider = createWorkspaceProvider();
        const result = await provider.get(
            {} as any,
            { metadata: {} } as any,
            {} as any
        );

        expect(result?.text).toContain("Agent content");
        expect(loadWorkspaceBootstrapFiles).toHaveBeenCalled();
    });

    it("caches files for CACHE_TTL_MS", async () => {
        vi.useFakeTimers();
        const provider = createWorkspaceProvider();

        // First call
        await provider.get({} as any, { metadata: {} } as any, {} as any);
        expect(loadWorkspaceBootstrapFiles).toHaveBeenCalledTimes(1);

        // Second call immediately
        await provider.get({} as any, { metadata: {} } as any, {} as any);
        expect(loadWorkspaceBootstrapFiles).toHaveBeenCalledTimes(1);

        // Advance time past TTL (60s)
        vi.advanceTimersByTime(61_000);

        // Third call
        await provider.get({} as any, { metadata: {} } as any, {} as any);
        expect(loadWorkspaceBootstrapFiles).toHaveBeenCalledTimes(2);
    });

    it("handles errors gracefully", async () => {
        (loadWorkspaceBootstrapFiles as any).mockRejectedValue(new Error("Disk error"));
        const provider = createWorkspaceProvider();

        const result = await provider.get({} as any, { metadata: {} } as any, {} as any);

        expect(result?.text).toContain("[Workspace context unavailable: Disk error]");
        expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("Failed to load workspace context"));
    });

    it("enriches context with coding agent summary if metadata present", async () => {
        const provider = createWorkspaceProvider();
        const codingCtx = {
            sessionId: "session-1",
            taskDescription: "Code task",
            workingDirectory: "/wd",
            iterations: [],
            allFeedback: [],
            connector: { type: "local-fs", available: true },
            interactionMode: "fully-automated",
            active: true,
            maxIterations: 10,
        };

        const result = await provider.get(
            {} as any,
            {
                metadata: {
                    codingAgentContext: codingCtx
                }
            } as any,
            {} as any
        );

        expect(result?.text).toContain("Agent content"); // Workspace files
        expect(result?.text).toContain("## Coding Agent Session"); // Coding context
        expect(result?.text).toContain("**Task:** Code task");
        expect(result?.data).toEqual({
            workspaceDir: expect.any(String),
            codingSession: "session-1",
        });
    });

    it("filters files for subagent sessions", async () => {
        const provider = createWorkspaceProvider();
        const sessionKey = "subagent-session";

        await provider.get(
            {} as any,
            { metadata: { sessionKey } } as any,
            {} as any
        );

        expect(filterBootstrapFilesForSession).toHaveBeenCalledWith(mockFiles, sessionKey);
    });
  });
});
