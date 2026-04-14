import fsSync from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  resolveMiladyPackageRoot,
  resolveMiladyPackageRootSync,
} from "./milady-root";

vi.mock("node:fs/promises", () => ({
  default: {
    readFile: vi.fn(),
  },
}));

vi.mock("node:fs", () => ({
  default: {
    readFileSync: vi.fn(),
  },
}));

describe("milady-root utils", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe("resolveMiladyPackageRoot", () => {
    it("should resolve root using moduleUrl", async () => {
      const mockDir = path.resolve("/mock/dir");
      const expectedRoot = path.resolve("/mock");
      vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
        if (filePath === path.join(expectedRoot, "package.json")) {
          return JSON.stringify({ name: "milady" });
        }
        return JSON.stringify({ name: "something-else" });
      });

      const root = await resolveMiladyPackageRoot({
        moduleUrl: `file://${mockDir}/index.js`,
      });

      expect(root).toBe(expectedRoot);
    });

    it("should resolve root using argv1 when in .bin", async () => {
      const argv1 = "/workspace/node_modules/.bin/milady";
      const expectedRoot = "/workspace/node_modules/milady";

      vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
        if (filePath === path.join(expectedRoot, "package.json")) {
          return JSON.stringify({ name: "milady" });
        }
        return JSON.stringify({ name: "something-else" });
      });

      const root = await resolveMiladyPackageRoot({ argv1 });

      expect(root).toBe(expectedRoot);
    });

    it("should resolve root using cwd", async () => {
      const cwd = "/my/app/dir";
      const expectedRoot = "/my/app";

      vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
        if (filePath === path.join(expectedRoot, "package.json")) {
          return JSON.stringify({ name: "milady" });
        }
        throw new Error("Not found");
      });

      const root = await resolveMiladyPackageRoot({ cwd });

      expect(root).toBe(expectedRoot);
    });

    it("should return null if no package.json is found up to maxDepth", async () => {
      vi.mocked(fs.readFile).mockRejectedValue(new Error("ENOENT"));

      const root = await resolveMiladyPackageRoot({
        cwd: "/deep/path/where/nothing/exists",
      });

      expect(root).toBeNull();
    });

    it("should handle package.json with no name property", async () => {
      const cwd = "/app";
      vi.mocked(fs.readFile).mockResolvedValue(
        JSON.stringify({ version: "1.0.0" }),
      );

      const root = await resolveMiladyPackageRoot({ cwd });

      expect(root).toBeNull();
    });

    it("should handle invalid JSON in package.json", async () => {
      const cwd = "/app";
      vi.mocked(fs.readFile).mockResolvedValue("invalid json");

      const root = await resolveMiladyPackageRoot({ cwd });

      expect(root).toBeNull();
    });
  });

  describe("resolveMiladyPackageRootSync", () => {
    it("should resolve root using moduleUrl", () => {
      const mockDir = path.resolve("/mock/dir");
      const expectedRoot = path.resolve("/mock");
      vi.mocked(fsSync.readFileSync).mockImplementation((filePath) => {
        if (filePath === path.join(expectedRoot, "package.json")) {
          return JSON.stringify({ name: "milady" });
        }
        return JSON.stringify({ name: "something-else" });
      });

      const root = resolveMiladyPackageRootSync({
        moduleUrl: `file://${mockDir}/index.js`,
      });

      expect(root).toBe(expectedRoot);
    });

    it("should resolve root using argv1 when in .bin", () => {
      const argv1 = "/workspace/node_modules/.bin/milady";
      const expectedRoot = "/workspace/node_modules/milady";

      vi.mocked(fsSync.readFileSync).mockImplementation((filePath) => {
        if (filePath === path.join(expectedRoot, "package.json")) {
          return JSON.stringify({ name: "milady" });
        }
        return JSON.stringify({ name: "something-else" });
      });

      const root = resolveMiladyPackageRootSync({ argv1 });

      expect(root).toBe(expectedRoot);
    });

    it("should resolve root using cwd", () => {
      const cwd = "/my/app/dir";
      const expectedRoot = "/my/app";

      vi.mocked(fsSync.readFileSync).mockImplementation((filePath) => {
        if (filePath === path.join(expectedRoot, "package.json")) {
          return JSON.stringify({ name: "milady" });
        }
        throw new Error("Not found");
      });

      const root = resolveMiladyPackageRootSync({ cwd });

      expect(root).toBe(expectedRoot);
    });

    it("should return null if no package.json is found up to maxDepth", () => {
      vi.mocked(fsSync.readFileSync).mockImplementation(() => {
        throw new Error("ENOENT");
      });

      const root = resolveMiladyPackageRootSync({
        cwd: "/deep/path/where/nothing/exists",
      });

      expect(root).toBeNull();
    });

    it("should handle package.json with no name property", () => {
      const cwd = "/app";
      vi.mocked(fsSync.readFileSync).mockReturnValue(
        JSON.stringify({ version: "1.0.0" }),
      );

      const root = resolveMiladyPackageRootSync({ cwd });

      expect(root).toBeNull();
    });

    it("should handle invalid JSON in package.json", () => {
      const cwd = "/app";
      vi.mocked(fsSync.readFileSync).mockReturnValue("invalid json");

      const root = resolveMiladyPackageRootSync({ cwd });

      expect(root).toBeNull();
    });
  });
});
