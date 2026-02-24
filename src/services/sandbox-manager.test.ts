import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type ISandboxEngine,
  type SandboxEngineType,
  createEngine,
  detectBestEngine,
} from "./sandbox-engine";
import { SandboxManager, type SandboxManagerConfig } from "./sandbox-manager";

// Mock dependencies
const mockEngine = {
  engineType: "docker" as SandboxEngineType,
  isAvailable: vi.fn(),
  getInfo: vi.fn(),
  runContainer: vi.fn(),
  execInContainer: vi.fn(),
  stopContainer: vi.fn(),
  removeContainer: vi.fn(),
  isContainerRunning: vi.fn(),
  imageExists: vi.fn(),
  pullImage: vi.fn(),
  listContainers: vi.fn(),
  healthCheck: vi.fn(),
};

vi.mock("./sandbox-engine", () => ({
  createEngine: vi.fn(() => mockEngine),
  detectBestEngine: vi.fn(() => mockEngine),
}));

vi.mock("node:fs", () => ({
  mkdirSync: vi.fn(),
}));

describe("SandboxManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEngine.isAvailable.mockReturnValue(true);
    mockEngine.imageExists.mockReturnValue(true);
    mockEngine.listContainers.mockReturnValue([]);
    mockEngine.healthCheck.mockResolvedValue(true);
    mockEngine.runContainer.mockResolvedValue("mock-container-id");
    mockEngine.stopContainer.mockResolvedValue(undefined);
    mockEngine.removeContainer.mockResolvedValue(undefined);
  });

  describe("Initialization", () => {
    it("should initialize with default config", () => {
      const manager = new SandboxManager({ mode: "standard" });
      expect(manager.getState()).toBe("uninitialized");
      expect(detectBestEngine).toHaveBeenCalled();
    });

    it("should use specified engine type", () => {
      new SandboxManager({ mode: "standard", engineType: "docker" });
      expect(createEngine).toHaveBeenCalledWith("docker");
    });
  });

  describe("start()", () => {
    it("should handle 'off' mode", async () => {
      const manager = new SandboxManager({ mode: "off" });
      await manager.start();
      expect(manager.getState()).toBe("stopped");
      expect(mockEngine.runContainer).not.toHaveBeenCalled();
    });

    it("should handle 'light' mode", async () => {
      const manager = new SandboxManager({ mode: "light" });
      await manager.start();
      expect(manager.getState()).toBe("ready");
      expect(mockEngine.runContainer).not.toHaveBeenCalled();
    });

    it("should start container in 'standard' mode", async () => {
      const manager = new SandboxManager({ mode: "standard" });
      await manager.start();

      expect(manager.getState()).toBe("ready");
      expect(mockEngine.isAvailable).toHaveBeenCalled();
      expect(mockEngine.imageExists).toHaveBeenCalled();
      expect(mockEngine.listContainers).toHaveBeenCalled();
      expect(mockEngine.runContainer).toHaveBeenCalled();
      expect(mockEngine.healthCheck).toHaveBeenCalled();

      // Check event log
      const events = manager.getEventLog();
      expect(events).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: "container_start" }),
        ]),
      );
    });

    it("should fail if engine is not available", async () => {
      mockEngine.isAvailable.mockReturnValue(false);
      const manager = new SandboxManager({ mode: "standard" });

      await expect(manager.start()).rejects.toThrow("is not available");
      expect(manager.getState()).toBe("degraded");
    });

    it("should pull image if missing", async () => {
      mockEngine.imageExists.mockReturnValue(false);
      mockEngine.pullImage.mockResolvedValue(undefined);

      const manager = new SandboxManager({ mode: "standard" });
      await manager.start();

      expect(mockEngine.pullImage).toHaveBeenCalled();
      expect(manager.getState()).toBe("ready");
    });

    it("should fail if image pull fails", async () => {
      mockEngine.imageExists.mockReturnValue(false);
      mockEngine.pullImage.mockRejectedValue(new Error("Pull failed"));

      const manager = new SandboxManager({ mode: "standard" });
      await expect(manager.start()).rejects.toThrow("not found");
      expect(manager.getState()).toBe("degraded");
    });

    it("should clean up orphan containers", async () => {
      mockEngine.listContainers.mockReturnValue(["orphan-1", "orphan-2"]);
      const manager = new SandboxManager({ mode: "standard" });
      await manager.start();

      expect(mockEngine.stopContainer).toHaveBeenCalledWith("orphan-1");
      expect(mockEngine.removeContainer).toHaveBeenCalledWith("orphan-1");
      expect(mockEngine.stopContainer).toHaveBeenCalledWith("orphan-2");
      expect(mockEngine.removeContainer).toHaveBeenCalledWith("orphan-2");
    });

    it("should start browser container if enabled", async () => {
      mockEngine.runContainer
        .mockResolvedValueOnce("main-container")
        .mockResolvedValueOnce("browser-container");

      const manager = new SandboxManager({
        mode: "standard",
        browser: { enabled: true, autoStart: true },
      });
      await manager.start();

      expect(mockEngine.runContainer).toHaveBeenCalledTimes(2);
      expect(manager.getBrowserCdpEndpoint()).toBe("http://localhost:9222");
    });

    it("should handle browser start failure gracefully", async () => {
      mockEngine.runContainer
        .mockResolvedValueOnce("main-container")
        .mockRejectedValueOnce(new Error("Browser failed"));

      const manager = new SandboxManager({
        mode: "standard",
        browser: { enabled: true, autoStart: true },
      });
      await manager.start();

      expect(manager.getState()).toBe("ready"); // Still ready despite browser fail
      const events = manager.getEventLog();
      expect(events).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: "error",
            detail: expect.stringContaining("Browser container start failed"),
          }),
        ]),
      );
    });

    it("should enter degraded state if health check fails", async () => {
      mockEngine.healthCheck.mockResolvedValue(false);
      const manager = new SandboxManager({ mode: "standard" });
      await manager.start();

      expect(manager.getState()).toBe("degraded");
    });
  });

  describe("exec()", () => {
    it("should refuse exec in 'off' mode", async () => {
      const manager = new SandboxManager({ mode: "off" });
      const result = await manager.exec({ command: "ls" });
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("not available");
    });

    it("should refuse exec if not ready", async () => {
      const manager = new SandboxManager({ mode: "standard" });
      // Not started yet
      const result = await manager.exec({ command: "ls" });
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("Sandbox not ready");
    });

    it("should execute command in container", async () => {
      const manager = new SandboxManager({ mode: "standard" });
      await manager.start();

      mockEngine.execInContainer.mockResolvedValue({
        exitCode: 0,
        stdout: "ok",
        stderr: "",
        durationMs: 10,
      });

      const result = await manager.exec({ command: "echo hello" });
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe("ok");
      expect(result.executedInSandbox).toBe(true);
      expect(mockEngine.execInContainer).toHaveBeenCalledWith(
        expect.objectContaining({
          command: "echo hello",
          containerId: "mock-container-id",
        }),
      );
    });

    it("should handle exec errors", async () => {
      const manager = new SandboxManager({ mode: "standard" });
      await manager.start();

      mockEngine.execInContainer.mockRejectedValue(new Error("Exec failed"));

      const result = await manager.exec({ command: "fail" });
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("Exec error: Exec failed");
    });
  });

  describe("stop()", () => {
    it("should stop and remove containers", async () => {
      const manager = new SandboxManager({
        mode: "standard",
        browser: { enabled: true, autoStart: true },
      });
      mockEngine.runContainer
        .mockResolvedValueOnce("main-id")
        .mockResolvedValueOnce("browser-id");

      await manager.start();
      await manager.stop();

      expect(manager.getState()).toBe("stopped");
      expect(mockEngine.stopContainer).toHaveBeenCalledWith("main-id");
      expect(mockEngine.removeContainer).toHaveBeenCalledWith("main-id");
      expect(mockEngine.stopContainer).toHaveBeenCalledWith("browser-id");
      expect(mockEngine.removeContainer).toHaveBeenCalledWith("browser-id");
    });
  });

  describe("recover()", () => {
    it("should only recover from degraded state", async () => {
      const manager = new SandboxManager({ mode: "standard" });
      await manager.start(); // Ready
      await manager.recover();
      expect(manager.getState()).toBe("ready");
      // Should not have triggered recovery logic (cleanup/restart)
      expect(mockEngine.runContainer).toHaveBeenCalledTimes(1);
    });

    it("should attempt recovery from degraded state", async () => {
      mockEngine.healthCheck.mockResolvedValueOnce(false); // First start fails
      const manager = new SandboxManager({ mode: "standard" });
      await manager.start();
      expect(manager.getState()).toBe("degraded");

      mockEngine.healthCheck.mockResolvedValueOnce(true); // Recovery succeeds
      await manager.recover();

      expect(manager.getState()).toBe("ready");
      expect(mockEngine.runContainer).toHaveBeenCalledTimes(2); // Initial + Recovery
    });
  });
});
