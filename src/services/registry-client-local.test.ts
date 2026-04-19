import { describe, it, expect, vi, beforeEach } from "vitest";
import { applyLocalWorkspaceApps, applyNodeModulePlugins } from "./registry-client-local.js";
import * as fs from "node:fs/promises";
import * as path from "node:path";

vi.mock("node:fs/promises");

describe("registry-client-local", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("applyNodeModulePlugins", () => {
    it("should gracefully handle missing dirs without failing", async () => {
      // Mock that no node_modules/@elizaos exist
      vi.mocked(fs.readdir).mockRejectedValue(new Error("ENOENT"));

      const plugins = new Map();
      await applyNodeModulePlugins(plugins);

      expect(plugins.size).toBe(0);
    });

    it("should process plugin- packages correctly", async () => {
      // Mock directory structure
      vi.mocked(fs.readdir).mockImplementation(async (dirPath) => {
        if (String(dirPath).endsWith("@elizaos")) {
          return [
            { name: "plugin-test", isDirectory: () => true, isSymbolicLink: () => false },
            { name: "not-a-plugin", isDirectory: () => true, isSymbolicLink: () => false },
          ] as unknown as import("node:fs").Dirent[];
        }
        return [];
      });

      // Mock package.json reading
      vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
        if (String(filePath).includes("plugin-test/package.json")) {
          return JSON.stringify({
            name: "@elizaos/plugin-test",
            version: "1.0.0",
            description: "Test plugin",
            packageType: "plugin",
            repository: "github:elizaos/plugin-test",
          });
        }
        throw new Error("ENOENT");
      });

      vi.mocked(fs.realpath).mockImplementation(async (p) => String(p));

      const plugins = new Map();
      await applyNodeModulePlugins(plugins);

      expect(plugins.size).toBe(1);
      const plugin = plugins.get("@elizaos/plugin-test");
      expect(plugin).toBeDefined();
      expect(plugin?.name).toBe("@elizaos/plugin-test");
      expect(plugin?.gitRepo).toBe("github:elizaos/plugin-test");
      expect(plugin?.npm.v2Version).toBe("1.0.0");
    });
  });

  describe("applyLocalWorkspaceApps", () => {
    it("should gracefully handle missing dirs without failing", async () => {
      vi.mocked(fs.readdir).mockRejectedValue(new Error("ENOENT"));

      const plugins = new Map();
      await applyLocalWorkspaceApps(plugins);

      expect(plugins.size).toBe(0);
    });

    it("should process workspace apps correctly", async () => {
      vi.mocked(fs.readdir).mockImplementation(async (dirPath) => {
        if (String(dirPath).endsWith("plugins")) {
          return [
            { name: "app-test", isDirectory: () => true, isSymbolicLink: () => false },
          ] as unknown as import("node:fs").Dirent[];
        }
        throw new Error("ENOENT"); // Skip installed plugins loop
      });

      vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
        if (String(filePath).includes("app-test/package.json")) {
          return JSON.stringify({
            name: "@elizaos/app-test",
            version: "1.0.0",
            description: "Test app",
            elizaos: { kind: "app", app: { displayName: "Test App" } },
            repository: "github:elizaos/app-test",
          });
        }
        if (String(filePath).includes("app-test/elizaos.plugin.json")) {
          throw new Error("ENOENT");
        }
        throw new Error("ENOENT");
      });

      const plugins = new Map();
      await applyLocalWorkspaceApps(plugins);

      expect(plugins.size).toBe(1);
      const plugin = plugins.get("@elizaos/app-test");
      expect(plugin).toBeDefined();
      expect(plugin?.name).toBe("@elizaos/app-test");
      expect(plugin?.kind).toBe("app");
    });
  });
});
