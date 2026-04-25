import fsSync from "node:fs";
import fsAsync from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  resolveMiladyPackageRoot,
  resolveMiladyPackageRootSync,
} from "./milady-root.ts";

vi.mock("node:fs", () => ({
  default: {
    readFileSync: vi.fn(),
  },
}));

vi.mock("node:fs/promises", () => ({
  default: {
    readFile: vi.fn(),
  },
}));

vi.mock("node:url", () => ({
  fileURLToPath: vi.fn(),
}));

describe("milady-root", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("resolveMiladyPackageRoot (async)", () => {
    it("returns null if no candidates provided", async () => {
      const result = await resolveMiladyPackageRoot({});
      expect(result).toBeNull();
    });

    it("resolves to directory with package.json name 'milady' using cwd", async () => {
      const mockCwd = "/home/user/project/sub/dir";
      const expectedRoot = "/home/user/project";

      vi.mocked(fsAsync.readFile).mockImplementation(async (filePath) => {
        if (filePath === path.join(expectedRoot, "package.json")) {
          return JSON.stringify({ name: "milady" });
        }
        return JSON.stringify({ name: "something-else" });
      });

      const result = await resolveMiladyPackageRoot({ cwd: mockCwd });
      expect(result).toBe(expectedRoot);
    });

    it("resolves using argv1 when inside node_modules/.bin", async () => {
      const mockArgv1 = "/app/node_modules/.bin/run-milady";
      const expectedRoot = "/app";

      vi.mocked(fsAsync.readFile).mockImplementation(async (filePath) => {
        if (filePath === path.join(expectedRoot, "package.json")) {
          return JSON.stringify({ name: "milady" });
        }
        throw new Error("ENOENT");
      });

      const result = await resolveMiladyPackageRoot({ argv1: mockArgv1 });
      expect(result).toBe(expectedRoot);
    });

    it("resolves using moduleUrl", async () => {
      const mockModuleUrl = "file:///app/src/utils/index.ts";
      const mockFileUrlPath = "/app/src/utils/index.ts";
      vi.mocked(fileURLToPath).mockReturnValue(mockFileUrlPath);

      const expectedRoot = "/app";

      vi.mocked(fsAsync.readFile).mockImplementation(async (filePath) => {
        if (filePath === path.join(expectedRoot, "package.json")) {
          return JSON.stringify({ name: "milady" });
        }
        return JSON.stringify({ name: "not-milady" });
      });

      const result = await resolveMiladyPackageRoot({
        moduleUrl: mockModuleUrl,
      });
      expect(result).toBe(expectedRoot);
      expect(fileURLToPath).toHaveBeenCalledWith(mockModuleUrl);
    });

    it("returns null if maxDepth is exceeded", async () => {
      const mockCwd = "/a/b/c/d/e/f/g/h/i/j/k/l/m/n/o/p";

      vi.mocked(fsAsync.readFile).mockImplementation(async (filePath) => {
        if (filePath === path.join("/", "package.json")) {
          return JSON.stringify({ name: "milady" });
        }
        return JSON.stringify({ name: "not-milady" });
      });

      const result = await resolveMiladyPackageRoot({ cwd: mockCwd });
      expect(result).toBeNull();
    });

    it("handles parsing errors gracefully and continues", async () => {
      const mockCwd = "/home/user/project/sub";
      const expectedRoot = "/home/user/project";

      vi.mocked(fsAsync.readFile).mockImplementation(async (filePath) => {
        if (filePath === path.join(mockCwd, "package.json")) {
          return "invalid-json";
        }
        if (filePath === path.join(expectedRoot, "package.json")) {
          return JSON.stringify({ name: "milady" });
        }
        throw new Error("ENOENT");
      });

      const result = await resolveMiladyPackageRoot({ cwd: mockCwd });
      expect(result).toBe(expectedRoot);
    });

    it("returns null if none of the ancestor directories contain milady package.json", async () => {
      const mockCwd = "/home/user/project";
      vi.mocked(fsAsync.readFile).mockImplementation(async () => {
        return JSON.stringify({ name: "not-milady" });
      });

      const result = await resolveMiladyPackageRoot({ cwd: mockCwd });
      expect(result).toBeNull();
    });
  });

  describe("resolveMiladyPackageRootSync (sync)", () => {
    it("returns null if no candidates provided", () => {
      const result = resolveMiladyPackageRootSync({});
      expect(result).toBeNull();
    });

    it("resolves to directory with package.json name 'milady' using cwd", () => {
      const mockCwd = "/home/user/project/sub/dir";
      const expectedRoot = "/home/user/project";

      vi.mocked(fsSync.readFileSync).mockImplementation((filePath) => {
        if (filePath === path.join(expectedRoot, "package.json")) {
          return JSON.stringify({ name: "milady" });
        }
        return JSON.stringify({ name: "something-else" });
      });

      const result = resolveMiladyPackageRootSync({ cwd: mockCwd });
      expect(result).toBe(expectedRoot);
    });

    it("handles parsing errors gracefully and continues", () => {
      const mockCwd = "/home/user/project/sub";
      const expectedRoot = "/home/user/project";

      vi.mocked(fsSync.readFileSync).mockImplementation((filePath) => {
        if (filePath === path.join(mockCwd, "package.json")) {
          throw new Error("ENOENT");
        }
        if (filePath === path.join(expectedRoot, "package.json")) {
          return JSON.stringify({ name: "milady" });
        }
        throw new Error("ENOENT");
      });

      const result = resolveMiladyPackageRootSync({ cwd: mockCwd });
      expect(result).toBe(expectedRoot);
    });

    it("returns null when package.json does not contain a string name", () => {
      const mockCwd = "/home/user/project/sub";
      vi.mocked(fsSync.readFileSync).mockImplementation((_filePath) => {
        return JSON.stringify({ name: 123 });
      });

      const result = resolveMiladyPackageRootSync({ cwd: mockCwd });
      expect(result).toBeNull();
    });
  });
});
