import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { applyNodeModulePlugins, applyLocalWorkspaceApps } from "./registry-client-local.js";
import type { RegistryPluginInfo } from "./registry-client.js";

// Mock `fs/promises`
vi.mock("node:fs/promises", () => ({
  default: {
    readdir: vi.fn(),
    readFile: vi.fn(),
  },
}));

describe("registry-client-local", () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = process.env;
    process.env = { ...originalEnv };
    process.env.MILADY_WORKSPACE_ROOT = "/mock/workspace";
    process.env.MILADY_STATE_DIR = "/mock/state";
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("applyNodeModulePlugins", () => {
    it("should do nothing if no local plugins found", async () => {
      vi.mocked(fs.readdir).mockRejectedValue(new Error("ENOENT"));
      const plugins = new Map<string, RegistryPluginInfo>();

      await applyNodeModulePlugins(plugins);

      expect(plugins.size).toBe(0);
    });

    it("should discover and add new local plugin from node_modules", async () => {
      const elizaosDir = path.join("/mock/workspace", "node_modules", "@elizaos");

      vi.mocked(fs.readdir).mockImplementation(async (dirPath) => {
        if (dirPath === elizaosDir) {
          return [
            { name: "plugin-test", isDirectory: () => true, isSymbolicLink: () => false } as any,
          ];
        }
        throw new Error("ENOENT");
      });

      vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
        if (filePath.toString().includes("plugin-test")) {
          return JSON.stringify({
            name: "@elizaos/plugin-test",
            version: "1.0.0",
            packageType: "plugin",
            repository: "https://github.com/elizaos/plugin-test",
          });
        }
        throw new Error("ENOENT");
      });

      const plugins = new Map<string, RegistryPluginInfo>();
      await applyNodeModulePlugins(plugins);

      expect(plugins.size).toBe(1);
      const pluginInfo = plugins.get("@elizaos/plugin-test");
      expect(pluginInfo).toBeDefined();
      expect(pluginInfo?.localPath).toBe(path.join(elizaosDir, "plugin-test"));
      expect(pluginInfo?.npm.v2Version).toBe("1.0.0");
      expect(pluginInfo?.npm.package).toBe("@elizaos/plugin-test");
    });

    it("should update localPath if existing plugin doesn't have it", async () => {
      const elizaosDir = path.join("/mock/workspace", "node_modules", "@elizaos");

      vi.mocked(fs.readdir).mockImplementation(async (dirPath) => {
        if (dirPath === elizaosDir) {
          return [
            { name: "plugin-existing", isDirectory: () => true, isSymbolicLink: () => false } as any,
          ];
        }
        throw new Error("ENOENT");
      });

      vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
        if (filePath.toString().includes("plugin-existing")) {
          return JSON.stringify({
            name: "@elizaos/plugin-existing",
            packageType: "plugin",
          });
        }
        throw new Error("ENOENT");
      });

      const plugins = new Map<string, RegistryPluginInfo>();
      plugins.set("@elizaos/plugin-existing", {
        id: "existing-id",
        name: "@elizaos/plugin-existing",
        description: "",
        githubRepo: null,
        stars: 0,
        downloads: 0,
        tags: [],
        version: "1.0.0",
        localPath: null, // No local path
      });

      await applyNodeModulePlugins(plugins);

      expect(plugins.size).toBe(1);
      const pluginInfo = plugins.get("@elizaos/plugin-existing");
      expect(pluginInfo?.localPath).toBe(path.join(elizaosDir, "plugin-existing"));
    });

    it("should skip updating if existing plugin already has localPath", async () => {
      const elizaosDir = path.join("/mock/workspace", "node_modules", "@elizaos");

      vi.mocked(fs.readdir).mockImplementation(async (dirPath) => {
        if (dirPath === elizaosDir) {
          return [
            { name: "plugin-existing", isDirectory: () => true, isSymbolicLink: () => false } as any,
          ];
        }
        throw new Error("ENOENT");
      });

      vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
        if (filePath.toString().includes("plugin-existing")) {
          return JSON.stringify({
            name: "@elizaos/plugin-existing",
            packageType: "plugin",
          });
        }
        throw new Error("ENOENT");
      });

      const plugins = new Map<string, RegistryPluginInfo>();
      plugins.set("@elizaos/plugin-existing", {
        id: "existing-id",
        name: "@elizaos/plugin-existing",
        description: "",
        githubRepo: null,
        stars: 0,
        downloads: 0,
        tags: [],
        version: "1.0.0",
        localPath: "/some/other/path", // Has local path
      });

      await applyNodeModulePlugins(plugins);

      expect(plugins.size).toBe(1);
      const pluginInfo = plugins.get("@elizaos/plugin-existing");
      expect(pluginInfo?.localPath).toBe("/some/other/path");
    });
  });

  describe("applyLocalWorkspaceApps", () => {
    it("should discover and add new local app from plugins dir", async () => {
      const workspacePluginsDir = path.join("/mock/workspace", "plugins");

      vi.mocked(fs.readdir).mockImplementation(async (dirPath) => {
        if (dirPath === workspacePluginsDir) {
          return [
            { name: "app-test", isDirectory: () => true, isSymbolicLink: () => false } as any,
          ];
        }
        throw new Error("ENOENT");
      });

      vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
        if (filePath.toString().includes("package.json")) {
          return JSON.stringify({
            name: "app-test",
            version: "1.2.3",
            description: "Test App",
          });
        }
        if (filePath.toString().includes("elizaos.plugin.json")) {
          return JSON.stringify({
            kind: "app",
            app: {
              displayName: "Test App Display",
            }
          });
        }
        throw new Error("ENOENT");
      });

      const plugins = new Map<string, RegistryPluginInfo>();
      await applyLocalWorkspaceApps(plugins);

      expect(plugins.size).toBe(1);
      const appInfo = plugins.get("app-test");
      expect(appInfo).toBeDefined();
      expect(appInfo?.name).toBe("app-test");
      expect(appInfo?.npm.v2Version).toBe("1.2.3");
      expect(appInfo?.localPath).toBe(path.join(workspacePluginsDir, "app-test"));
      expect(appInfo?.kind).toBe("app");
      expect(appInfo?.appMeta?.displayName).toBe("Test App Display");
    });

    it("should merge localPath and appMeta for existing apps", async () => {
      const workspacePluginsDir = path.join("/mock/workspace", "plugins");

      vi.mocked(fs.readdir).mockImplementation(async (dirPath) => {
        if (dirPath === workspacePluginsDir) {
          return [
            { name: "app-existing", isDirectory: () => true, isSymbolicLink: () => false } as any,
          ];
        }
        throw new Error("ENOENT");
      });

      vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
        if (filePath.toString().includes("package.json")) {
          return JSON.stringify({
            name: "app-existing",
            version: "2.0.0",
          });
        }
        if (filePath.toString().includes("elizaos.plugin.json")) {
          return JSON.stringify({
            kind: "app",
            app: {
              displayName: "Local App Name",
              category: "Finance" // override default category
            }
          });
        }
        throw new Error("ENOENT");
      });

      const plugins = new Map<string, RegistryPluginInfo>();
      plugins.set("app-existing", {
        name: "app-existing",
        gitRepo: null,
        gitUrl: null,
        description: "Existing Description",
        homepage: null,
        topics: [],
        stars: 0,
        language: "TypeScript",
        supports: { v0: false, v1: false, v2: true },
        localPath: null,
        kind: "plugin", // Kind will be overridden by local kind
        appMeta: {
          displayName: "Remote App Name",
          category: "Finance",
        },
        npm: {
          package: "app-existing",
          v0Version: null,
          v1Version: null,
          v2Version: "1.0.0",
        },
        git: {
          v0Branch: null,
          v1Branch: null,
          v2Branch: "main",
        }
      });

      await applyLocalWorkspaceApps(plugins);

      expect(plugins.size).toBe(1);
      const appInfo = plugins.get("app-existing");
      expect(appInfo?.localPath).toBe(path.join(workspacePluginsDir, "app-existing"));
      expect(appInfo?.kind).toBe("app");
      // Original appMeta category is preserved, displayName overridden by local
      expect(appInfo?.appMeta?.displayName).toBe("Local App Name");
      expect(appInfo?.appMeta?.category).toBe("Finance");
    });
  });
});
