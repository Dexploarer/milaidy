import { describe, it, expect, vi, afterEach } from "vitest";
import {
  runCommandWithTimeout,
  resolveDefaultAgentWorkspaceDir,
  loadWorkspaceBootstrapFiles,
  filterBootstrapFilesForSession,
  type WorkspaceBootstrapFile,
} from "./workspace.js";
import { EventEmitter } from "node:events";
import { Buffer } from "node:buffer";

const { mockSpawn, mockFs, mockOs, mockPath } = vi.hoisted(() => {
  return {
    mockSpawn: vi.fn(),
    mockFs: {
      writeFile: vi.fn(),
      readFile: vi.fn(),
      mkdir: vi.fn(),
      access: vi.fn(),
      stat: vi.fn(),
      realpath: vi.fn((p) => Promise.resolve(p)),
    },
    mockOs: {
      homedir: vi.fn(),
    },
    mockPath: {
      join: vi.fn((...args) => args.join("/")),
    },
  };
});

vi.mock("node:child_process", () => {
  return {
    spawn: mockSpawn,
  };
});

vi.mock("node:fs/promises", () => {
  return {
    default: mockFs,
    ...mockFs,
  };
});

vi.mock("node:os", () => {
  return {
    default: mockOs,
    ...mockOs,
  };
});

vi.mock("node:path", () => {
  return {
    default: mockPath,
    ...mockPath,
  };
});

vi.mock("../config/paths.js", () => ({
  resolveUserPath: (p: string) => p,
}));

vi.mock("@elizaos/core", () => ({
  logger: {
    warn: vi.fn(),
  },
  isSubagentSessionKey: (key: string) => key.startsWith("subagent"),
}));

describe("workspace", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("runCommandWithTimeout", () => {
    it("should resolve with stdout on success", async () => {
      const mockChild = new EventEmitter() as any;
      mockChild.stdout = new EventEmitter();
      mockChild.stderr = new EventEmitter();
      mockChild.kill = vi.fn();
      mockSpawn.mockReturnValue(mockChild);

      const promise = runCommandWithTimeout(["echo", "hello"], {
        timeoutMs: 1000,
      });

      mockChild.stdout.emit("data", Buffer.from("hello"));
      mockChild.emit("close", 0);

      const result = await promise;
      expect(result.code).toBe(0);
      expect(result.stdout).toBe("hello");
    });

    it("should reject on timeout", async () => {
      vi.useFakeTimers();
      const mockChild = new EventEmitter() as any;
      mockChild.stdout = new EventEmitter();
      mockChild.stderr = new EventEmitter();
      mockChild.kill = vi.fn();
      mockSpawn.mockReturnValue(mockChild);

      const promise = runCommandWithTimeout(["sleep", "10"], {
        timeoutMs: 100,
      });

      vi.advanceTimersByTime(200);
      mockChild.emit("close", null); // Simulate close after kill

      await expect(promise).rejects.toThrow("Command timed out");
      expect(mockChild.kill).toHaveBeenCalledWith("SIGKILL");
      vi.useRealTimers();
    });
  });

  describe("resolveDefaultAgentWorkspaceDir", () => {
    it("should return default workspace dir", () => {
      mockOs.homedir.mockReturnValue("/home/user");
      const dir = resolveDefaultAgentWorkspaceDir({}, mockOs.homedir);
      expect(dir).toBe("/home/user/.milaidy/workspace");
    });

    it("should return profile workspace dir", () => {
      mockOs.homedir.mockReturnValue("/home/user");
      const dir = resolveDefaultAgentWorkspaceDir(
        { MILAIDY_PROFILE: "dev" },
        mockOs.homedir,
      );
      expect(dir).toBe("/home/user/.milaidy/workspace-dev");
    });
  });

  describe("loadWorkspaceBootstrapFiles", () => {
    it("should load files correctly", async () => {
      mockFs.readFile.mockResolvedValue("content");
      const files = await loadWorkspaceBootstrapFiles("/workspace");
      expect(files.length).toBeGreaterThan(0);
      expect(files[0].content).toBe("content");
      expect(files[0].missing).toBe(false);
    });

    it("should mark missing files", async () => {
      const error = new Error("ENOENT");
      (error as any).code = "ENOENT";
      mockFs.readFile.mockRejectedValue(error);
      const files = await loadWorkspaceBootstrapFiles("/workspace");
      expect(files[0].missing).toBe(true);
    });
  });

  describe("filterBootstrapFilesForSession", () => {
    it("should return all files if no session key", () => {
      const files = [{ name: "AGENTS.md" }] as WorkspaceBootstrapFile[];
      const result = filterBootstrapFilesForSession(files);
      expect(result).toEqual(files);
    });

    it("should filter files for subagent session", () => {
      const files = [
        { name: "AGENTS.md" },
        { name: "TOOLS.md" },
        { name: "USER.md" },
      ] as WorkspaceBootstrapFile[];
      const result = filterBootstrapFilesForSession(files, "subagent-123");
      expect(result.length).toBe(2);
      expect(result.map((f) => f.name)).toEqual(["AGENTS.md", "TOOLS.md"]);
    });
  });
});
