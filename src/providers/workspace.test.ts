import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import path from "node:path";
import os from "node:os";
import { EventEmitter } from "node:events";

const { mockFs, mockSpawn } = vi.hoisted(() => {
  return {
    mockFs: {
      writeFile: vi.fn(),
      stat: vi.fn(),
      mkdir: vi.fn(),
      access: vi.fn(),
      readFile: vi.fn(),
      realpath: vi.fn(),
    },
    mockSpawn: vi.fn(),
  };
});

// Mock child_process
vi.mock("node:child_process", () => ({
  spawn: (...args: any[]) => mockSpawn(...args),
}));

// Mock fs/promises
vi.mock("node:fs/promises", () => ({
  default: mockFs,
  writeFile: (...args: any[]) => mockFs.writeFile(...args),
  stat: (...args: any[]) => mockFs.stat(...args),
  mkdir: (...args: any[]) => mockFs.mkdir(...args),
  access: (...args: any[]) => mockFs.access(...args),
  readFile: (...args: any[]) => mockFs.readFile(...args),
  realpath: (...args: any[]) => mockFs.realpath(...args),
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
    },
    isSubagentSessionKey: (key: string) => key.startsWith("subagent-"),
  };
});

// Import after mocks
import {
  runCommandWithTimeout,
  resolveDefaultAgentWorkspaceDir,
  ensureAgentWorkspace,
  loadWorkspaceBootstrapFiles,
  filterBootstrapFilesForSession,
  DEFAULT_AGENT_WORKSPACE_DIR,
} from "./workspace";

describe("src/providers/workspace.ts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("runCommandWithTimeout", () => {
    it("should resolve with stdout and stderr on success", async () => {
      const mockChild = new EventEmitter() as any;
      mockChild.stdout = new EventEmitter();
      mockChild.stderr = new EventEmitter();
      mockChild.kill = vi.fn();
      mockSpawn.mockReturnValue(mockChild);

      const promise = runCommandWithTimeout(["echo", "hello"]);

      mockChild.stdout.emit("data", Buffer.from("hello"));
      mockChild.stderr.emit("data", Buffer.from("world"));
      mockChild.emit("close", 0);

      const result = await promise;
      expect(result).toEqual({
        code: 0,
        stdout: "hello",
        stderr: "world",
      });
      expect(mockSpawn).toHaveBeenCalledWith("echo", ["hello"], expect.any(Object));
    });

    it("should handle timeout", async () => {
      vi.useFakeTimers();
      const mockChild = new EventEmitter() as any;
      mockChild.stdout = new EventEmitter();
      mockChild.stderr = new EventEmitter();
      mockChild.kill = vi.fn();
      mockSpawn.mockReturnValue(mockChild);

      const promise = runCommandWithTimeout(["sleep", "10"], { timeoutMs: 100 });

      vi.advanceTimersByTime(100);
      mockChild.emit("close", null); // Process killed

      await expect(promise).rejects.toThrow(/Command timed out/);
      expect(mockChild.kill).toHaveBeenCalledWith("SIGKILL");
      vi.useRealTimers();
    });

    it("should reject on error", async () => {
        const mockChild = new EventEmitter() as any;
        mockChild.stdout = new EventEmitter();
        mockChild.stderr = new EventEmitter();
        mockChild.kill = vi.fn();
        mockSpawn.mockReturnValue(mockChild);

        const promise = runCommandWithTimeout(["fail"]);

        mockChild.emit("error", new Error("spawn failed"));

        await expect(promise).rejects.toThrow("spawn failed");
    });
  });

  describe("resolveDefaultAgentWorkspaceDir", () => {
    it("should return default workspace path", () => {
      const result = resolveDefaultAgentWorkspaceDir({}, () => "/home/user");
      expect(result).toBe(path.join("/home/user", ".milaidy", "workspace"));
    });

    it("should return profile-specific workspace path", () => {
      const result = resolveDefaultAgentWorkspaceDir(
        { MILAIDY_PROFILE: "dev" },
        () => "/home/user"
      );
      expect(result).toBe(path.join("/home/user", ".milaidy", "workspace-dev"));
    });
  });

  describe("ensureAgentWorkspace", () => {
    it("should create directory if it doesn't exist", async () => {
      mockFs.mkdir.mockResolvedValue(undefined);
      const result = await ensureAgentWorkspace({ dir: "/tmp/workspace" });
      expect(mockFs.mkdir).toHaveBeenCalledWith(path.resolve("/tmp/workspace"), { recursive: true });
      expect(result.dir).toBe(path.resolve("/tmp/workspace"));
    });

    it("should ensure bootstrap files are created if requested", async () => {
        mockFs.mkdir.mockResolvedValue(undefined);
        // Simulate no files exist
        mockFs.access.mockRejectedValue({ code: "ENOENT" });
        mockFs.writeFile.mockResolvedValue(undefined);
        mockFs.stat.mockRejectedValue({ code: "ENOENT" }); // .git check

        // Mock git version check to fail so we don't try git init
        const mockChild = new EventEmitter() as any;
        mockChild.stdout = new EventEmitter();
        mockChild.stderr = new EventEmitter();
        mockChild.kill = vi.fn();
        mockSpawn.mockReturnValue(mockChild);
        setTimeout(() => mockChild.emit("close", 1), 0); // git --version fails

        await ensureAgentWorkspace({ dir: "/tmp/workspace", ensureBootstrapFiles: true });

        // Should write all templates
        expect(mockFs.writeFile).toHaveBeenCalledTimes(6); // AGENTS, TOOLS, IDENTITY, USER, HEARTBEAT, BOOTSTRAP
    });
  });

  describe("loadWorkspaceBootstrapFiles", () => {
    it("should load existing files", async () => {
      mockFs.access.mockResolvedValue(undefined); // File exists
      mockFs.readFile.mockResolvedValue("content");
      mockFs.realpath.mockImplementation((p: string) => Promise.resolve(p)); // Just return path

      const files = await loadWorkspaceBootstrapFiles("/tmp/workspace");

      // Since mockFs.access always succeeds, it will find MEMORY.md and memory.md too.
      // So 6 default + 2 memory = 8 files.
      // But deduping logic might reduce it if realpath returns same for both (case insensitive fs? no, distinct paths)
      // realpath mock returns path as is. So they are distinct.
      // So 8 files.

      expect(files.length).toBeGreaterThanOrEqual(6);
      expect(files[0]).toEqual({
        name: "AGENTS.md",
        path: path.resolve("/tmp/workspace/AGENTS.md"),
        content: "content",
        missing: false,
      });
    });

    it("should handle missing files", async () => {
        mockFs.access.mockRejectedValue({ code: "ENOENT" }); // File missing
        mockFs.readFile.mockRejectedValue({ code: "ENOENT" });
        mockFs.realpath.mockImplementation((p: string) => Promise.resolve(p));

        const files = await loadWorkspaceBootstrapFiles("/tmp/workspace");

        // Even if access fails, loadWorkspaceBootstrapFiles returns entries for default files with missing: true
        // But for memory files, if access fails, they are NOT added.
        // So 6 files.

        expect(files).toHaveLength(6);
        expect(files[0].missing).toBe(true);
    });
  });

  describe("filterBootstrapFilesForSession", () => {
    it("should return all files for normal session", () => {
        const files: any[] = [{ name: "AGENTS.md" }, { name: "USER.md" }];
        const result = filterBootstrapFilesForSession(files, "session-123");
        expect(result).toEqual(files);
    });

    it("should filter files for subagent session", () => {
        const files: any[] = [{ name: "AGENTS.md" }, { name: "USER.md" }, { name: "TOOLS.md" }];
        const result = filterBootstrapFilesForSession(files, "subagent-123");
        expect(result).toHaveLength(2);
        expect(result.map(f => f.name)).toEqual(["AGENTS.md", "TOOLS.md"]);
    });
  });
});
