import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { applyLocalWorkspaceApps, applyNodeModulePlugins } from "./registry-client-local.js";

vi.mock("node:fs/promises");
vi.mock("node:os");

vi.mock("../../utils/globals.js", () => ({
    resolveWorkspaceRoots: vi.fn(() => ["/test/workspace"]),
}));

vi.mock("./registry-client-app-meta.js", () => ({
  mergeAppMeta: vi.fn((a, b) => b || a),
  resolveAppOverride: vi.fn(() => null)
}));

describe("registry-client-local", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(os, "homedir").mockReturnValue("/test/home");
    });

    describe("applyLocalWorkspaceApps", () => {
        it("should handle error when reading plugins directory", async () => {
            vi.mocked(fs.readdir).mockRejectedValue(new Error("enoent"));

            const plugins = new Map();
            await applyLocalWorkspaceApps(plugins);
            expect(plugins.size).toBe(0);
        });

        it("should discover local workspace apps successfully", async () => {
            // Mock directory entries for plugins dir
            vi.mocked(fs.readdir).mockImplementation(async (dirPath) => {
                const dir = dirPath.toString();
                if (dir.endsWith("plugins")) {
                    return [
                        { name: "app-test-app", isDirectory: () => true, isSymbolicLink: () => false }
                    ] as any;
                }
                if (dir.includes("installed")) {
                    return [] as any;
                }
                throw new Error("enoent");
            });

            // Mock file content reads
            vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
                const p = filePath.toString();
                if (p.endsWith("package.json")) {
                    return JSON.stringify({
                        name: "@scope/app-test-app",
                        version: "1.0.0",
                        description: "Test app",
                        elizaos: { kind: "app" }
                    });
                }
                if (p.endsWith("elizaos.plugin.json")) {
                    return JSON.stringify({
                        app: { displayName: "Test App Custom" }
                    });
                }
                throw new Error("enoent");
            });

            const plugins = new Map();
            await applyLocalWorkspaceApps(plugins);
            expect(plugins.size).toBe(1);
            expect(plugins.has("@scope/app-test-app")).toBe(true);
            const appInfo = plugins.get("@scope/app-test-app");
            expect(appInfo?.name).toBe("@scope/app-test-app");
            expect(appInfo?.kind).toBe("app");
            expect(appInfo?.description).toBe("Test app");
        });

        it("should merge with existing plugins", async () => {
            vi.mocked(fs.readdir).mockImplementation(async (dirPath) => {
                const dir = dirPath.toString();
                if (dir.endsWith("plugins")) {
                    return [
                        { name: "app-merge-app", isDirectory: () => true, isSymbolicLink: () => false }
                    ] as any;
                }
                throw new Error("enoent");
            });

            vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
                const p = filePath.toString();
                if (p.endsWith("package.json")) {
                    return JSON.stringify({
                        name: "merge-app",
                        description: "New description"
                    });
                }
                return "{}";
            });

            const plugins = new Map();
            plugins.set("merge-app", {
                name: "merge-app",
                description: "Old description",
                gitRepo: "test/repo",
                gitUrl: "https://github.com/test/repo",
                homepage: null,
                topics: [],
                stars: 0,
                language: "TypeScript",
                npm: { package: "merge-app", v0Version: null, v1Version: null, v2Version: "1.0.0" },
                git: { v0Branch: null, v1Branch: null, v2Branch: "main" },
                supports: { v0: false, v1: false, v2: true },
                localPath: "/old/path"
            });

            await applyLocalWorkspaceApps(plugins);

            const updated = plugins.get("merge-app");
            expect(updated?.description).toBe("New description");
            expect(updated?.localPath).toMatch(/plugins\/app-merge-app/);
        });
    });

    describe("applyNodeModulePlugins", () => {
        it("should discover node modules plugins correctly", async () => {
            vi.mocked(fs.readdir).mockImplementation(async (dirPath) => {
                const dir = dirPath.toString();
                if (dir.endsWith("@elizaos")) {
                    return [
                        { name: "plugin-test", isDirectory: () => true, isSymbolicLink: () => false },
                        { name: "plugin-app", isDirectory: () => true, isSymbolicLink: () => false } // Should be skipped due to kind
                    ] as any;
                }
                throw new Error("enoent");
            });

            vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
                const p = filePath.toString();
                if (p.includes("plugin-test/package.json")) {
                    return JSON.stringify({
                        name: "@elizaos/plugin-test",
                        packageType: "plugin",
                        version: "1.0.0"
                    });
                }
                if (p.includes("plugin-app/package.json")) {
                    return JSON.stringify({
                        name: "@elizaos/plugin-app",
                        packageType: "plugin",
                        elizaos: { kind: "app" }
                    });
                }
                throw new Error("enoent");
            });

            vi.mocked(fs.realpath).mockImplementation(async (p) => p.toString());

            const plugins = new Map();
            await applyNodeModulePlugins(plugins);

            expect(plugins.size).toBe(1);
            expect(plugins.has("@elizaos/plugin-test")).toBe(true);
            expect(plugins.has("@elizaos/plugin-app")).toBe(false);

            const plugin = plugins.get("@elizaos/plugin-test");
            expect(plugin?.name).toBe("@elizaos/plugin-test");
            expect(plugin?.npm.v2Version).toBe("1.0.0");
        });

        it("should merge local paths into existing plugins", async () => {
             vi.mocked(fs.readdir).mockImplementation(async (dirPath) => {
                const dir = dirPath.toString();
                if (dir.endsWith("@elizaos")) {
                    return [
                        { name: "plugin-existing", isDirectory: () => true, isSymbolicLink: () => false }
                    ] as any;
                }
                throw new Error("enoent");
            });

            vi.mocked(fs.readFile).mockImplementation(async () => {
                return JSON.stringify({
                    name: "@elizaos/plugin-existing",
                    packageType: "plugin"
                });
            });

            vi.mocked(fs.realpath).mockImplementation(async (p) => p.toString());

            const plugins = new Map();
            plugins.set("@elizaos/plugin-existing", {
                name: "@elizaos/plugin-existing",
                gitRepo: "test/repo",
                gitUrl: "https://test.com",
                description: "Old",
                homepage: null,
                topics: [],
                stars: 0,
                language: "TS",
                npm: { package: "pkg", v0Version: null, v1Version: null, v2Version: null },
                git: { v0Branch: null, v1Branch: null, v2Branch: "main" },
                supports: { v0: false, v1: false, v2: true },
            });

            await applyNodeModulePlugins(plugins);

            const updated = plugins.get("@elizaos/plugin-existing");
            expect(updated?.localPath).toMatch(/node_modules\/@elizaos\/plugin-existing/);
        });
    });
});
