import { describe, it, expect, beforeEach, afterEach, mock, spyOn, setSystemTime } from "bun:test";

const vi = {
  clearAllMocks: () => {},
  useFakeTimers: () => {},
  useRealTimers: () => { setSystemTime(); },
  advanceTimersByTime: (ms: number) => { setSystemTime(new Date(Date.now() + ms)); },
  mock: mock.module,
  fn: mock,
  spyOn,
  setSystemTime,
  mocked: (f: any) => f as any
};

mock.module("@elizaos/core", () => ({
  ChannelType: { VOICE_DM: "VOICE_DM", VOICE_GROUP: "VOICE_GROUP" },
  logger: {
    info: mock(),
    error: mock(),
    warn: mock(),
    debug: mock(),
  },
}));

import { ChannelType, type IAgentRuntime, type Memory, type State } from "@elizaos/core";
import {
  truncate,
  buildContext,
  buildCodingAgentSummary,
  createWorkspaceProvider,
} from "./workspace-provider";
import type { WorkspaceBootstrapFile } from "./workspace";
import * as workspaceModule from "./workspace";
import type { CodingAgentContext } from "../services/coding-agent-context";

import * as originalWorkspace from "./workspace";
// Mock the workspace module dependencies
mock.module("./workspace", () => {
  return {
    ...originalWorkspace,
    loadWorkspaceBootstrapFiles: mock(),
    filterBootstrapFilesForSession: mock((files, sessionKey) => files),
    DEFAULT_AGENT_WORKSPACE_DIR: "/mock/workspace",
  };
});

describe("workspace-provider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("truncate", () => {
    it("returns original content if length is less than or equal to max", () => {
      expect(truncate("hello", 10)).toBe("hello");
      expect(truncate("1234567890", 10)).toBe("1234567890");
    });

    it("truncates and adds truncation notice if length exceeds max", () => {
      const result = truncate("123456789012", 10);
      expect(result).toBe("1234567890\n\n[... truncated at 10 chars]");
    });
  });

  describe("buildContext", () => {
    it("returns empty string for empty files", () => {
      expect(buildContext([], 1000)).toBe("");
    });

    it("skips missing or empty files", () => {
      const files: WorkspaceBootstrapFile[] = [
        { name: "missing.md", missing: true },
        { name: "empty.md", content: "   ", missing: false },
        { name: "valid.md", content: "hello", missing: false },
      ];
      const context = buildContext(files, 1000);
      expect(context).toContain("### valid.md");
      expect(context).not.toContain("missing.md");
      expect(context).not.toContain("empty.md");
    });

    it("formats multiple files with delimiters", () => {
      const files: WorkspaceBootstrapFile[] = [
        { name: "A.md", content: "File A", missing: false },
        { name: "B.md", content: "File B", missing: false },
      ];
      const context = buildContext(files, 1000);
      expect(context).toContain("## Project Context (Workspace)");
      expect(context).toContain("### A.md");
      expect(context).toContain("File A");
      expect(context).toContain("---");
      expect(context).toContain("### B.md");
      expect(context).toContain("File B");
    });

    it("applies per-file truncation limits and tags", () => {
      const files: WorkspaceBootstrapFile[] = [
        { name: "A.md", content: "1234567890", missing: false },
      ];
      const context = buildContext(files, 5);
      expect(context).toContain("### A.md [TRUNCATED]");
      expect(context).toContain("12345\n\n[... truncated at 5 chars]");
    });

    it("stops adding files if max total workspace chars is exceeded", () => {
      // MAX_TOTAL_WORKSPACE_CHARS is 100_000, so we make huge strings
      const hugeContent = "x".repeat(60_000);
      const files: WorkspaceBootstrapFile[] = [
        { name: "A.md", content: hugeContent, missing: false },
        { name: "B.md", content: hugeContent, missing: false },
        { name: "C.md", content: "Should not be included", missing: false },
      ];

      const context = buildContext(files, 100_000);
      expect(context).toContain("A.md");
      expect(context).not.toContain("B.md");
      expect(context).not.toContain("C.md");
    });
  });

  describe("buildCodingAgentSummary", () => {
    it("formats a basic coding agent summary", () => {
      const ctx = {
        taskDescription: "Fix bugs",
        workingDirectory: "/app",
        interactionMode: "autonomous",
        active: true,
        connector: { type: "local", available: true },
        iterations: [],
        allFeedback: [],
      } as unknown as CodingAgentContext;

      const summary = buildCodingAgentSummary(ctx);
      expect(summary).toContain("## Coding Agent Session");
      expect(summary).toContain("**Task:** Fix bugs");
      expect(summary).toContain("**Working Directory:** /app");
      expect(summary).toContain("**Mode:** autonomous");
      expect(summary).toContain("**Active:** yes");
      expect(summary).toContain("**Connector:** local");
      expect(summary).not.toContain("**Connector Status:** unavailable");
    });

    it("indicates when connector is unavailable", () => {
      const ctx = {
        taskDescription: "Test",
        workingDirectory: "/app",
        interactionMode: "autonomous",
        active: false,
        connector: { type: "cloud", available: false },
        iterations: [],
        allFeedback: [],
      } as unknown as CodingAgentContext;

      const summary = buildCodingAgentSummary(ctx);
      expect(summary).toContain("**Active:** no");
      expect(summary).toContain("**Connector Status:** unavailable");
    });

    it("includes errors from the last iteration", () => {
      const ctx = {
        taskDescription: "Test",
        workingDirectory: "/app",
        interactionMode: "autonomous",
        active: true,
        connector: { type: "local", available: true },
        iterations: [
          {
            errors: [
              { category: "Syntax", message: "Missing bracket", filePath: "index.js", line: 10 },
              { category: "Build", message: "Failed", filePath: "main.js" }
            ],
            commandResults: []
          }
        ],
        allFeedback: [],
      } as unknown as CodingAgentContext;

      const summary = buildCodingAgentSummary(ctx);
      expect(summary).toContain("### Errors to Resolve");
      expect(summary).toContain("- [Syntax] (index.js:10): Missing bracket");
      expect(summary).toContain("- [Build] (main.js): Failed");
    });

    it("includes pending human feedback", () => {
      const ctx = {
        taskDescription: "Test",
        workingDirectory: "/app",
        interactionMode: "autonomous",
        active: true,
        connector: { type: "local", available: true },
        iterations: [
          { errors: [], commandResults: [] },
          { errors: [], commandResults: [] },
          { errors: [], commandResults: [] }
        ],
        allFeedback: [
          { type: "approval", text: "Looks good", iterationRef: 0, timestamp: 1, id: "1" },
          { type: "guidance", text: "Change this", iterationRef: 2, timestamp: 2, id: "2" },
          { type: "correction", text: "Rebooted", iterationRef: undefined, timestamp: 3, id: "3" }
        ] as any,
      } as unknown as CodingAgentContext;

      const summary = buildCodingAgentSummary(ctx);
      expect(summary).toContain("### Human Feedback");
      expect(summary).toContain("- [guidance]: Change this");
      expect(summary).toContain("- [correction]: Rebooted");
      expect(summary).not.toContain("Looks good");
    });

    it("includes recent commands from the last iteration", () => {
      const ctx = {
        taskDescription: "Test",
        workingDirectory: "/app",
        interactionMode: "autonomous",
        active: true,
        connector: { type: "local", available: true },
        iterations: [
          {
            errors: [],
            commandResults: [
              { command: "npm install", success: true, stdout: "ok", exitCode: 0 },
              { command: "npm test", success: false, stderr: "failed", exitCode: 1 }
            ]
          }
        ],
        allFeedback: [],
      } as unknown as CodingAgentContext;

      const summary = buildCodingAgentSummary(ctx);
      expect(summary).toContain("### Recent Commands");
      expect(summary).toContain("- `npm install` → OK");
      expect(summary).toContain("stdout: ok");
      expect(summary).toContain("- `npm test` → FAIL(1)");
      expect(summary).toContain("stderr: failed");
    });
  });

  describe("createWorkspaceProvider", () => {
    let provider: ReturnType<typeof createWorkspaceProvider>;
    let mockRuntime: IAgentRuntime;
    let mockMemory: Memory;
    let mockState: State;

    beforeEach(() => {
      provider = createWorkspaceProvider({
        workspaceDir: "/custom/workspace",
        maxCharsPerFile: 500,
      });
      mockRuntime = {} as IAgentRuntime;
      mockMemory = {
        userId: "user",
        agentId: "agent",
        roomId: "room",
        content: { text: "hello" },
      };
      mockState = {} as State;

      // Reset module state to clear cache for isolated tests (can't easily reset internal module cache, so we use fake timers to expire it)
      vi.advanceTimersByTime(100_000);
    });

    it("skips generating context for voice channels", async () => {
      mockMemory.content.channelType = ChannelType.VOICE_DM;
      const result = await provider.get(mockRuntime, mockMemory, mockState);

      expect(result).toEqual({
        text: "",
        data: {
          workspaceDir: "/custom/workspace",
          skipped: "voice_channel",
        },
      });
      expect(workspaceModule.loadWorkspaceBootstrapFiles).not.toHaveBeenCalled();
    });

    it("fetches files and generates context successfully", async () => {
      const mockFiles = [
        { name: "AGENTS.md", content: "Instructions", missing: false }
      ];
      vi.mocked(workspaceModule.loadWorkspaceBootstrapFiles).mockResolvedValueOnce(mockFiles);

      const result = await provider.get(mockRuntime, mockMemory, mockState);

      expect(workspaceModule.loadWorkspaceBootstrapFiles).toHaveBeenCalledWith("/custom/workspace");
      expect(result?.text).toContain("## Project Context (Workspace)");
      expect(result?.text).toContain("### AGENTS.md");
      expect(result?.text).toContain("Instructions");
      expect(result?.data).toEqual({ workspaceDir: "/custom/workspace" });
    });

    it("uses cache on subsequent calls within TTL", async () => {
      const testProvider = createWorkspaceProvider({ workspaceDir: "/cache-test1" });
      const mockFiles = [{ name: "DOC1.md", content: "cached1", missing: false }];
      vi.mocked(workspaceModule.loadWorkspaceBootstrapFiles).mockResolvedValue(mockFiles);

      await testProvider.get(mockRuntime, mockMemory, mockState);

      // Clear mock state to assert properly
      vi.mocked(workspaceModule.loadWorkspaceBootstrapFiles).mockClear();

      // Call again immediately
      const result2 = await testProvider.get(mockRuntime, mockMemory, mockState);
      expect(workspaceModule.loadWorkspaceBootstrapFiles).toHaveBeenCalledTimes(0);
      expect(result2?.text).toContain("DOC1.md");
    });

    it("invalidates cache after TTL expires", async () => {
      const testProvider = createWorkspaceProvider({ workspaceDir: "/cache-test2" });
      const mockFiles = [{ name: "DOC2.md", content: "cached2", missing: false }];
      vi.mocked(workspaceModule.loadWorkspaceBootstrapFiles).mockResolvedValue(mockFiles);

      await testProvider.get(mockRuntime, mockMemory, mockState);

      vi.mocked(workspaceModule.loadWorkspaceBootstrapFiles).mockClear();

      // Advance time beyond TTL (60_000 ms)
      vi.advanceTimersByTime(61_000);

      await testProvider.get(mockRuntime, mockMemory, mockState);
      expect(workspaceModule.loadWorkspaceBootstrapFiles).toHaveBeenCalledTimes(1);
    });

    it("evicts oldest cache entries when MAX_CACHE_ENTRIES is exceeded", async () => {
      vi.mocked(workspaceModule.loadWorkspaceBootstrapFiles).mockResolvedValue([]);

      // MAX_CACHE_ENTRIES is 20
      for (let i = 0; i < 22; i++) {
        const testProvider = createWorkspaceProvider({ workspaceDir: `/cache-limit-${i}` });
        await testProvider.get(mockRuntime, mockMemory, mockState);
      }

      // The first entry (0) should have been evicted.
      vi.mocked(workspaceModule.loadWorkspaceBootstrapFiles).mockClear();

      const testProvider0 = createWorkspaceProvider({ workspaceDir: "/cache-limit-0" });
      await testProvider0.get(mockRuntime, mockMemory, mockState);

      // Since it was evicted, it should be loaded again
      expect(workspaceModule.loadWorkspaceBootstrapFiles).toHaveBeenCalledTimes(1);
      expect(workspaceModule.loadWorkspaceBootstrapFiles).toHaveBeenCalledWith("/cache-limit-0");
    });

    it("passes sessionKey for file filtering if present in metadata", async () => {
      const testProvider = createWorkspaceProvider({ workspaceDir: "/session-test" });
      const mockFiles = [{ name: "DOC.md", content: "data", missing: false }];
      vi.mocked(workspaceModule.loadWorkspaceBootstrapFiles).mockResolvedValue(mockFiles);

      mockMemory.metadata = { sessionKey: "session-123" };

      await testProvider.get(mockRuntime, mockMemory, mockState);

      expect(workspaceModule.filterBootstrapFilesForSession).toHaveBeenCalledWith(
        mockFiles,
        "session-123"
      );
    });

    it("returns an error fallback message if loading fails", async () => {
      const testProvider = createWorkspaceProvider({ workspaceDir: "/error-test" });
      vi.mocked(workspaceModule.loadWorkspaceBootstrapFiles).mockRejectedValue(new Error("Disk error"));

      const result = await testProvider.get(mockRuntime, mockMemory, mockState);

      expect(result?.text).toBe("[Workspace context unavailable: Disk error]");
      expect(result?.data).toEqual({});
    });

    it("returns an error fallback message if loading fails with a non-Error string", async () => {
      const testProvider = createWorkspaceProvider({ workspaceDir: "/error-test2" });
      vi.mocked(workspaceModule.loadWorkspaceBootstrapFiles).mockRejectedValue("Disk error string");

      const result = await testProvider.get(mockRuntime, mockMemory, mockState);

      expect(result?.text).toBe("[Workspace context unavailable: Disk error string]");
      expect(result?.data).toEqual({});
    });
  });
});
