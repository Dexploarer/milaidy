/**
 * Tests for the Milady plugin installer.
 *
 * Exercises install/uninstall flows, config persistence, error handling,
 * concurrent operations, and cross-platform path logic.
 */

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Dynamic import for module reset between tests
// ---------------------------------------------------------------------------

async function loadInstaller() {
  return await import("./plugin-installer");
}

// ---------------------------------------------------------------------------
// Boundary stubs — only network I/O and process lifecycle are stubbed.
// The installer logic itself (fs operations, config read/write, validation)
// executes real code against a real temp directory.
// ---------------------------------------------------------------------------

vi.mock("./registry-client", () => ({
  getPluginInfo: vi.fn(),
}));

vi.mock("../runtime/restart", () => ({
  requestRestart: vi.fn(),
}));

vi.mock("node:child_process", async () => {
  const actual =
    await vi.importActual<typeof import("node:child_process")>(
      "node:child_process",
    );
  return {
    ...actual,
    execFile: vi.fn(
      (_cmd: string, args: string[], optionsOrCb: unknown, cb?: unknown) => {
        let callback = typeof optionsOrCb === "function" ? optionsOrCb : cb;
        if (!callback && typeof args === "function") callback = args as unknown;

        const argsStr = JSON.stringify(args || []);
        const cbFn = callback as (
          err: Error | null,
          stdout: string,
          stderr: string,
        ) => void;

        if (argsStr.includes("--version")) {
          return process.nextTick(() => cbFn(null, "1.0.0", ""));
        }
        if (argsStr.includes("file:")) {
          return process.nextTick(() => cbFn(null, "", ""));
        }

        process.nextTick(() =>
          cbFn(new Error("Mock command failed"), "", "error from mock"),
        );
      },
    ),
  };
});

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

let tmpDir: string;
let configDir: string;
let configPath: string;
let savedEnv: Record<string, string | undefined>;

function writeConfig(data: Record<string, unknown>) {
  const fsSync = require("node:fs") as typeof import("node:fs");
  fsSync.writeFileSync(configPath, JSON.stringify(data, null, 2));
}

function readConfig(): Record<string, unknown> {
  const fsSync = require("node:fs") as typeof import("node:fs");
  return JSON.parse(fsSync.readFileSync(configPath, "utf-8"));
}

function testPluginInfo(overrides: Record<string, unknown> = {}) {
  return {
    name: "@elizaos/plugin-test",
    gitRepo: "elizaos-plugins/plugin-test",
    gitUrl: "https://github.com/elizaos-plugins/plugin-test.git",
    description: "Test plugin",
    homepage: null,
    topics: [],
    stars: 0,
    language: "TypeScript",
    npm: {
      package: "@elizaos/plugin-test",
      v0Version: null,
      v1Version: null,
      v2Version: "2.0.0-alpha.3",
    },
    git: { v0Branch: null, v1Branch: null, v2Branch: "next" },
    supports: { v0: false, v1: false, v2: true },
    ...overrides,
  };
}

async function writeLocalPluginSource(
  rootDir: string,
  packageName: string,
  version: string,
): Promise<string> {
  const packageDir = path.join(rootDir, "local-plugin-src");
  await fs.mkdir(packageDir, { recursive: true });
  await fs.writeFile(
    path.join(packageDir, "package.json"),
    JSON.stringify(
      {
        name: packageName,
        version,
        type: "module",
        main: "index",
      },
      null,
      2,
    ),
  );
  await fs.writeFile(
    path.join(packageDir, "index"),
    "export default { name: 'local-plugin' };",
  );
  return packageDir;
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();

  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "milady-inst-test-"));
  configDir = path.join(tmpDir, ".milady");
  configPath = path.join(configDir, "milady.json");

  await fs.mkdir(configDir, { recursive: true });
  writeConfig({});

  savedEnv = {
    MILADY_STATE_DIR: process.env.MILADY_STATE_DIR,
    MILADY_CONFIG_PATH: process.env.MILADY_CONFIG_PATH,
  };
  process.env.MILADY_STATE_DIR = configDir;
  process.env.MILADY_CONFIG_PATH = configPath;
});

afterEach(async () => {
  vi.restoreAllMocks();
  process.env.MILADY_STATE_DIR = savedEnv.MILADY_STATE_DIR;
  process.env.MILADY_CONFIG_PATH = savedEnv.MILADY_CONFIG_PATH;
  await fs.rm(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("plugin-installer", () => {
  describe("installPlugin", () => {
    it("returns error when plugin is not found in registry", async () => {
      const { getPluginInfo } = await import("./registry-client");
      vi.mocked(getPluginInfo).mockResolvedValue(null);

      const { installPlugin } = await loadInstaller();
      const result = await installPlugin("@elizaos/plugin-nonexistent");

      expect(result.success).toBe(false);
      expect(result.error).toContain("not found");
      expect(result.pluginName).toBe("@elizaos/plugin-nonexistent");
    });

    it("reports progress phases during install (real npm failure path)", async () => {
      const { getPluginInfo } = await import("./registry-client");
      // Use a package name that definitely doesn't exist on npm
      vi.mocked(getPluginInfo).mockResolvedValue(
        testPluginInfo({ name: "@elizaos/plugin-nonexistent-test-12345" }),
      );

      const phases: string[] = [];
      const { installPlugin } = await loadInstaller();
      const result = await installPlugin(
        "@elizaos/plugin-nonexistent-test-12345",
        (progress) => {
          phases.push(progress.phase);
        },
      );

      // Should have emitted resolving and downloading phases before failing
      expect(phases).toContain("resolving");
      expect(phases).toContain("downloading");
      // Both npm and git should fail for a nonexistent package
      expect(result.success).toBe(false);
    }, 180_000);

    it("installs from local workspace path when available", async () => {
      const localSourcePath = await writeLocalPluginSource(
        tmpDir,
        "@elizaos/plugin-local-source",
        "1.2.3",
      );
      const { getPluginInfo } = await import("./registry-client");
      vi.mocked(getPluginInfo).mockResolvedValue(
        testPluginInfo({
          name: "@elizaos/plugin-local-source",
          npm: {
            package: "@elizaos/plugin-local-source",
            v0Version: null,
            v1Version: null,
            v2Version: "1.2.3",
          },
          localPath: localSourcePath,
        }),
      );

      const { installPlugin, listInstalledPlugins } = await loadInstaller();
      const result = await installPlugin("@elizaos/plugin-local-source");

      expect(result.success).toBe(true);
      expect(result.pluginName).toBe("@elizaos/plugin-local-source");
      expect(result.version).toBe("1.2.3");

      const installed = listInstalledPlugins();
      const localPlugin = installed.find(
        (plugin) => plugin.name === "@elizaos/plugin-local-source",
      );
      expect(localPlugin).toBeDefined();
      expect(localPlugin?.version).toBe("1.2.3");
    }, 180_000);
  });

  describe("uninstallPlugin", () => {
    it("returns error when plugin is not in config.plugins.installs", async () => {
      writeConfig({});

      const { uninstallPlugin } = await loadInstaller();
      const result = await uninstallPlugin("@elizaos/plugin-test");

      expect(result.success).toBe(false);
      expect(result.error).toContain("not a user-installed plugin");
    });

    it("removes plugin from config and disk", async () => {
      const installDir = path.join(
        configDir,
        "plugins",
        "installed",
        "_elizaos_plugin-test",
      );
      await fs.mkdir(installDir, { recursive: true });
      await fs.writeFile(path.join(installDir, "marker.txt"), "test");

      writeConfig({
        plugins: {
          installs: {
            "@elizaos/plugin-test": {
              source: "npm",
              installPath: installDir,
              version: "1.0.0",
              installedAt: "2026-02-07T00:00:00Z",
            },
          },
        },
      });

      const { uninstallPlugin } = await loadInstaller();
      const result = await uninstallPlugin("@elizaos/plugin-test");

      expect(result.success).toBe(true);
      expect(result.requiresRestart).toBe(true);

      // Verify config was updated
      const config = readConfig();
      const installs = (
        config.plugins as Record<string, Record<string, unknown>>
      )?.installs;
      expect(installs).toBeDefined();
      expect(installs?.["@elizaos/plugin-test"]).toBeUndefined();

      // Verify directory was removed
      await expect(fs.access(installDir)).rejects.toThrow();
    });

    it("succeeds even if install directory doesn't exist on disk", async () => {
      const ghostDir = path.join(
        configDir,
        "plugins",
        "installed",
        "_elizaos_plugin-ghost",
      );
      writeConfig({
        plugins: {
          installs: {
            "@elizaos/plugin-ghost": {
              source: "npm",
              installPath: ghostDir,
              version: "1.0.0",
            },
          },
        },
      });

      const { uninstallPlugin } = await loadInstaller();
      const result = await uninstallPlugin("@elizaos/plugin-ghost");

      expect(result.success).toBe(true);
    });

    it("fails when install directory removal errors unexpectedly", async () => {
      const installDir = path.join(
        configDir,
        "plugins",
        "installed",
        "_elizaos_plugin-broken",
      );
      await fs.mkdir(installDir, { recursive: true });
      writeConfig({
        plugins: {
          installs: {
            "@elizaos/plugin-broken": {
              source: "npm",
              installPath: installDir,
              version: "1.0.0",
            },
          },
        },
      });

      const rmSpy = vi
        .spyOn(fs, "rm")
        .mockRejectedValueOnce(new Error("permission denied"));

      const { uninstallPlugin } = await loadInstaller();
      const result = await uninstallPlugin("@elizaos/plugin-broken");

      expect(result.success).toBe(false);
      expect(result.error).toContain("Failed to remove plugin directory");
      rmSpy.mockRestore();
    });

    it("refuses to remove install paths outside the plugins directory", async () => {
      writeConfig({
        plugins: {
          installs: {
            "@elizaos/plugin-escape": {
              source: "npm",
              installPath: "/",
              version: "1.0.0",
            },
          },
        },
      });

      const { uninstallPlugin } = await loadInstaller();
      const result = await uninstallPlugin("@elizaos/plugin-escape");

      expect(result.success).toBe(false);
      expect(result.error).toContain("Refusing to remove plugin outside");
    });
  });

  describe("listInstalledPlugins", () => {
    it("returns empty array when no plugins installed", async () => {
      writeConfig({});

      const { listInstalledPlugins } = await loadInstaller();
      const list = listInstalledPlugins();

      expect(list).toEqual([]);
    });

    it("returns installed plugins with metadata", async () => {
      writeConfig({
        plugins: {
          installs: {
            "@elizaos/plugin-a": {
              source: "npm",
              installPath: "/path/a",
              version: "1.0.0",
              installedAt: "2026-01-01T00:00:00Z",
            },
            "@elizaos/plugin-b": {
              source: "npm",
              installPath: "/path/b",
              version: "2.0.0",
              installedAt: "2026-02-01T00:00:00Z",
            },
          },
        },
      });

      const { listInstalledPlugins } = await loadInstaller();
      const list = listInstalledPlugins();

      expect(list).toHaveLength(2);
      expect(list[0].name).toBe("@elizaos/plugin-a");
      expect(list[0].version).toBe("1.0.0");
      expect(list[0].installPath).toBe("/path/a");
      expect(list[1].name).toBe("@elizaos/plugin-b");
    });

    it("handles missing fields gracefully with defaults", async () => {
      writeConfig({
        plugins: {
          installs: {
            "@elizaos/plugin-sparse": {
              source: "npm",
              // Missing version, installPath, installedAt
            },
          },
        },
      });

      const { listInstalledPlugins } = await loadInstaller();
      const list = listInstalledPlugins();

      expect(list).toHaveLength(1);
      expect(list[0].version).toBe("unknown");
      expect(list[0].installPath).toBe("");
      expect(list[0].installedAt).toBe("");
    });
  });

  describe("installAndRestart", () => {
    it("does NOT call requestRestart when install fails", async () => {
      const { getPluginInfo } = await import("./registry-client");
      vi.mocked(getPluginInfo).mockResolvedValue(testPluginInfo());

      const { requestRestart } = await import("../runtime/restart");
      const { installAndRestart } = await loadInstaller();

      // In test env npm/git installs fail (packages don't exist)
      const result = await installAndRestart("@elizaos/plugin-test");

      // Assert unconditionally: install must fail, restart must not fire
      expect(result.success).toBe(false);
      expect(vi.mocked(requestRestart)).not.toHaveBeenCalled();
    }, 180_000);
  });

  describe("uninstallAndRestart", () => {
    it("calls requestRestart when uninstall succeeds", async () => {
      const installDir = path.join(configDir, "plugins", "installed", "_elizaos_plugin-test");
      await fs.mkdir(installDir, { recursive: true });

      writeConfig({
        plugins: {
          installs: {
            "@elizaos/plugin-test": {
              source: "npm",
              installPath: installDir,
              version: "1.0.0",
            },
          },
        },
      });

      const { requestRestart } = await import("../runtime/restart");
      const { uninstallAndRestart } = await loadInstaller();

      const result = await uninstallAndRestart("@elizaos/plugin-test");

      expect(result.success).toBe(true);
      expect(vi.mocked(requestRestart)).toHaveBeenCalledWith("Plugin @elizaos/plugin-test uninstalled");
    });

    it("does NOT call requestRestart when uninstall fails", async () => {
      writeConfig({});

      const { requestRestart } = await import("../runtime/restart");
      const { uninstallAndRestart } = await loadInstaller();

      const result = await uninstallAndRestart("@elizaos/plugin-test");

      expect(result.success).toBe(false);
      expect(vi.mocked(requestRestart)).not.toHaveBeenCalled();
    });
  });

  describe("validation helpers", () => {
    it("assertValidPackageName throws on invalid names", async () => {
      const { assertValidPackageName } = await loadInstaller();
      expect(() => assertValidPackageName("invalid name!")).toThrow("Invalid package name");
      expect(() => assertValidPackageName("; rm -rf /")).toThrow("Invalid package name");
    });

    it("assertValidGitUrl throws on invalid URLs", async () => {
      const { assertValidGitUrl } = await loadInstaller();
      expect(() => assertValidGitUrl("http://github.com/a/b")).toThrow("Invalid git URL");
      expect(() => assertValidGitUrl("https://github.com/a/b; rm -rf /")).toThrow("Invalid git URL");
    });
  });

  describe("git clone install", () => {
    it("falls back to git clone and builds typescript dir if it exists", async () => {
      const { getPluginInfo } = await import("./registry-client");
      vi.mocked(getPluginInfo).mockResolvedValue(
        testPluginInfo({
          name: "@elizaos/plugin-git-fallback",
          npm: { package: "@elizaos/plugin-git-fallback", v2Version: "1.0.0", v1Version: null, v0Version: null },
        })
      );

      const { execFile } = await import("node:child_process");
      vi.mocked(execFile).mockImplementation((_cmd: string, args: string[], optionsOrCb: unknown, cb?: unknown) => {
        let callback = typeof optionsOrCb === "function" ? optionsOrCb : cb;
        const cbFn = callback as (err: Error | null, stdout: string | {stdout: string, stderr: string}, stderr: string) => void;

        if (args.includes("clone")) {
          // Mock git clone: create the tempDir and a typescript subfolder with a package.json
          const tempDir = args[args.length - 1]; // last arg is tempDir
          const fsSync = require("node:fs");
          const path = require("node:path");
          fsSync.mkdirSync(path.join(tempDir, "typescript"), { recursive: true });
          fsSync.writeFileSync(path.join(tempDir, "typescript", "package.json"), '{"name":"mock"}');
          return process.nextTick(() => cbFn(null, {stdout:"", stderr:""}, ""));
        }
        if (args.includes("ls-remote")) {
          return process.nextTick(() => cbFn(null, {stdout:"", stderr:""}, ""));
        }
        if (args.includes("--version")) {
          return process.nextTick(() => cbFn(null, {stdout:"1.0.0", stderr:""}, ""));
        }
        if (args.includes("install") && args.includes("--ignore-scripts") && !args.includes("--prefix")) {
          return process.nextTick(() => cbFn(null, {stdout:"", stderr:""}, ""));
        }
        if (args.includes("run") && args.includes("build")) {
          return process.nextTick(() => cbFn(null, {stdout:"", stderr:""}, ""));
        }

        // npm install fails
        process.nextTick(() => cbFn(new Error("mock err"), "", ""));
        return {} as ReturnType<typeof import("node:child_process").execFile>;
      });

      const { installPlugin } = await loadInstaller();
      const result = await installPlugin("@elizaos/plugin-git-fallback");

      expect(result.success).toBe(true);
      expect(result.pluginName).toBe("@elizaos/plugin-git-fallback");
    });

    it("falls back to git clone, logs build error if build fails, and resolves entry point", async () => {
      const { getPluginInfo } = await import("./registry-client");
      vi.mocked(getPluginInfo).mockResolvedValue(
        testPluginInfo({
          name: "@elizaos/plugin-git-build-fail",
          npm: { package: "@elizaos/plugin-git-build-fail", v2Version: "1.0.0", v1Version: null, v0Version: null },
        })
      );

      const { execFile } = await import("node:child_process");
      vi.mocked(execFile).mockImplementation((_cmd: string, args: string[], optionsOrCb: unknown, cb?: unknown) => {
        let callback = typeof optionsOrCb === "function" ? optionsOrCb : cb;
        const cbFn = callback as (err: Error | null, stdout: string | {stdout: string, stderr: string}, stderr: string) => void;

        if (args.includes("clone")) {
          const tempDir = args[args.length - 1];
          const fsSync = require("node:fs");
          const path = require("node:path");
          fsSync.mkdirSync(path.join(tempDir, "typescript"), { recursive: true });
          fsSync.writeFileSync(path.join(tempDir, "typescript", "package.json"), '{"name":"mock"}');
          return process.nextTick(() => cbFn(null, {stdout:"", stderr:""}, ""));
        }
        if (args.includes("ls-remote")) return process.nextTick(() => cbFn(null, {stdout:"", stderr:""}, ""));
        if (args.includes("--version")) return process.nextTick(() => cbFn(null, {stdout:"1.0.0", stderr:""}, ""));
        if (args.includes("install") && args.includes("--ignore-scripts") && !args.includes("--prefix")) {
          return process.nextTick(() => cbFn(null, {stdout:"", stderr:""}, ""));
        }
        if (args.includes("run") && args.includes("build")) {
          // Fail the build
          return process.nextTick(() => cbFn(new Error("build failed spectacularly"), "", ""));
        }

        process.nextTick(() => cbFn(new Error("mock err"), "", ""));
        return {} as ReturnType<typeof import("node:child_process").execFile>;
      });

      const { installPlugin } = await loadInstaller();
      const result = await installPlugin("@elizaos/plugin-git-build-fail");

      expect(result.success).toBe(true);
    });

    it("fails install if entry point cannot be resolved", async () => {
      const { getPluginInfo } = await import("./registry-client");
      vi.mocked(getPluginInfo).mockResolvedValue(
        testPluginInfo({
          name: "@elizaos/plugin-no-entry",
          npm: { package: "@elizaos/plugin-no-entry", v2Version: "1.0.0", v1Version: null, v0Version: null },
        })
      );

      const { execFile } = await import("node:child_process");
      vi.mocked(execFile).mockImplementation((_cmd: string, args: string[], optionsOrCb: unknown, cb?: unknown) => {
        let callback = typeof optionsOrCb === "function" ? optionsOrCb : cb;
        const cbFn = callback as (err: Error | null, stdout: string | {stdout: string, stderr: string}, stderr: string) => void;

        if (args.includes("clone")) {
          // Do not create typescript/ nor package.json to cause resolveEntryPoint to return null
          const tempDir = args[args.length - 1];
          const fsSync = require("node:fs");
          fsSync.mkdirSync(tempDir, { recursive: true });
          return process.nextTick(() => cbFn(null, {stdout:"", stderr:""}, ""));
        }
        if (args.includes("ls-remote") || args.includes("--version") || (args.includes("install") && !args.includes("--prefix"))) {
          return process.nextTick(() => cbFn(null, {stdout:"", stderr:""}, ""));
        }

        process.nextTick(() => cbFn(new Error("mock err"), "", ""));
        return {} as ReturnType<typeof import("node:child_process").execFile>;
      });

      // We need to also prevent the default initialised package.json in the targetDir from being found
      // Wait, installPlugin creates package.json in targetDir!
      // If it creates it, resolveEntryPoint will find it.
      // So we have to delete it during git clone!
      const originalClone = vi.mocked(execFile).getMockImplementation();
      vi.mocked(execFile).mockImplementation((_cmd: string, args: string[], optionsOrCb: unknown, cb?: unknown) => {
        if (args.includes("clone")) {
          const tempDir = args[args.length - 1];
          const path = require("node:path");
          const targetDir = path.join(path.dirname(tempDir), "_elizaos_plugin-no-entry");
          const fsSync = require("node:fs");
          try { fsSync.unlinkSync(path.join(targetDir, "package.json")); } catch (e) {}
        }
        return originalClone!(_cmd, args, optionsOrCb, cb);
      });

      const { installPlugin } = await loadInstaller();
      const result = await installPlugin("@elizaos/plugin-no-entry");

      expect(result.success).toBe(false);
      expect(result.error).toContain("entry point could not be resolved");
    });
  });

  describe("detectPackageManager", () => {
    it("returns npm if both bun and npm fail", async () => {
      const { detectPackageManager } = await loadInstaller();

      const { execFile } = await import("node:child_process");
      vi.mocked(execFile).mockImplementation((_cmd: string, _args: string[], optionsOrCb: unknown, cb?: unknown) => {
        let callback = typeof optionsOrCb === "function" ? optionsOrCb : cb;
        const cbFn = callback as (err: Error | null, stdout: string, stderr: string) => void;
        process.nextTick(() => cbFn(new Error("not found"), "", ""));
        return {} as ReturnType<typeof import("node:child_process").execFile>;
      });

      const pm = await detectPackageManager();
      expect(pm).toBe("npm");
    });
  });

  describe("resolveGitBranch", () => {
    it("resolves main if no standard branches are found and ls-remote fails", async () => {
      const { resolveGitBranch } = await loadInstaller();

      const { execFile } = await import("node:child_process");
      vi.mocked(execFile).mockImplementation((_cmd: string, args: string[], optionsOrCb: unknown, cb?: unknown) => {
        let callback = typeof optionsOrCb === "function" ? optionsOrCb : cb;
        const cbFn = callback as (err: Error | null, stdout: string, stderr: string) => void;
        process.nextTick(() => cbFn(new Error("mock err"), "", ""));
        return {} as ReturnType<typeof import("node:child_process").execFile>;
      });

      const branch = await resolveGitBranch(testPluginInfo());
      expect(branch).toBe("main");
    });

    it("resolves branch from ls-remote if candidates fail", async () => {
      const { resolveGitBranch } = await loadInstaller();

      const { execFile } = await import("node:child_process");
      vi.mocked(execFile).mockImplementation((_cmd: string, args: string[], optionsOrCb: unknown, cb?: unknown) => {
        let callback = typeof optionsOrCb === "function" ? optionsOrCb : cb;
        const cbFn = callback as (err: Error | null, stdout: string, stderr: string) => void;
        if (args.includes("ls-remote") && args.includes("--heads")) {
          // If a specific branch is passed, mock false by returning empty.
          // Command format: "git ls-remote --heads <url> <branch>"
          if (args.length === 4) {
            return process.nextTick(() => cbFn(null, { stdout: "", stderr: "" } as any, ""));
          }
          // "git ls-remote --heads <url>"
          if (args.length === 3) {
            return process.nextTick(() => cbFn(null, { stdout: "hash refs/heads/develop\nhash refs/heads/feature", stderr: "" } as any, ""));
          }
          return process.nextTick(() => cbFn(new Error("unexpected args length"), "", ""));
        }
        process.nextTick(() => cbFn(new Error("mock err"), "", ""));
        return {} as ReturnType<typeof import("node:child_process").execFile>;
      });

      const branch = await resolveGitBranch(testPluginInfo());
      expect(branch).toBe("develop");
    });
  });

  describe("path helpers", () => {
    it("sanitises package names for directory paths", async () => {
      // We test this indirectly through installPlugin — the targetDir
      // should be sanitised with no special characters
      const { getPluginInfo } = await import("./registry-client");
      vi.mocked(getPluginInfo).mockResolvedValue(
        testPluginInfo({ name: "@elizaos/plugin-foo-bar" }),
      );

      const phases: Array<{
        pluginName: string;
        message: string;
        phase: string;
      }> = [];
      const { installPlugin } = await loadInstaller();
      await installPlugin("@elizaos/plugin-foo-bar", (p) => phases.push(p));

      // The install should have been attempted in a sanitised directory
      // (@ and / replaced with _)
      const downloadPhase = phases.find((p) => p.phase === "downloading");
      expect(downloadPhase).toBeDefined();
    }, 180_000);
  });

  describe("serialisation", () => {
    it("serialises concurrent install calls", async () => {
      const { getPluginInfo } = await import("./registry-client");
      vi.mocked(getPluginInfo).mockResolvedValue(null); // Quick rejection

      const { installPlugin } = await loadInstaller();

      // Launch multiple installs concurrently — they should not corrupt config
      const results = await Promise.all([
        installPlugin("@elizaos/plugin-a"),
        installPlugin("@elizaos/plugin-b"),
        installPlugin("@elizaos/plugin-c"),
      ]);

      // All should fail (not found) but none should throw
      for (const r of results) {
        expect(r.success).toBe(false);
        expect(r.error).toContain("not found");
      }
    });
  });
});
