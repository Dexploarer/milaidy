import fsSync from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
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

describe("milady-root", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("resolveMiladyPackageRoot", () => {
    it("finds root via argv1 with node_modules", async () => {
      const mockArgv1 = "/project/node_modules/.bin/milady";

      vi.mocked(fs.readFile).mockImplementation(async (filepath) => {
        if (
          filepath
            .toString()
            .includes(path.join("/project/node_modules/.bin", "package.json"))
        ) {
          throw new Error("ENOENT");
        }
        if (
          filepath
            .toString()
            .includes(path.join("/project/node_modules/milady", "package.json"))
        ) {
          return JSON.stringify({ name: "milady" });
        }
        throw new Error("ENOENT");
      });

      const result = await resolveMiladyPackageRoot({ argv1: mockArgv1 });
      expect(result).toBe(path.resolve("/project/node_modules/milady"));
    });

    it("finds root via cwd", async () => {
      vi.mocked(fs.readFile).mockImplementation(async (filepath) => {
        if (
          filepath.toString().includes(path.join("/test/dir", "package.json"))
        ) {
          return JSON.stringify({ name: "milady" });
        }
        throw new Error("ENOENT");
      });

      const result = await resolveMiladyPackageRoot({ cwd: "/test/dir" });
      expect(result).toBe(path.resolve("/test/dir"));
    });

    it("returns null if package.json does not match", async () => {
      vi.mocked(fs.readFile).mockResolvedValue(
        JSON.stringify({ name: "other" }),
      );
      const result = await resolveMiladyPackageRoot({ cwd: "/test" });
      expect(result).toBeNull();
    });

    it("handles fs errors gracefully", async () => {
      vi.mocked(fs.readFile).mockRejectedValue(new Error("not found"));
      const result = await resolveMiladyPackageRoot({ cwd: "/test" });
      expect(result).toBeNull();
    });

    it("finds root via moduleUrl", async () => {
      const moduleUrl = `file://${path.resolve("/module/dir/index.js")}`;
      vi.mocked(fs.readFile).mockImplementation(async (filepath) => {
        if (
          filepath
            .toString()
            .includes(path.join(path.resolve("/module/dir"), "package.json"))
        ) {
          return JSON.stringify({ name: "milady" });
        }
        throw new Error("ENOENT");
      });

      const result = await resolveMiladyPackageRoot({ moduleUrl });
      expect(result).toBe(path.resolve("/module/dir"));
    });
  });

  describe("resolveMiladyPackageRootSync", () => {
    it("finds root via cwd", () => {
      vi.mocked(fsSync.readFileSync).mockImplementation((filepath) => {
        if (
          filepath.toString().includes(path.join("/test/dir", "package.json"))
        ) {
          return JSON.stringify({ name: "milady" });
        }
        throw new Error("ENOENT");
      });

      const result = resolveMiladyPackageRootSync({ cwd: "/test/dir" });
      expect(result).toBe(path.resolve("/test/dir"));
    });

    it("handles missing files without throwing", () => {
      vi.mocked(fsSync.readFileSync).mockImplementation(() => {
        throw new Error("not found");
      });
      const result = resolveMiladyPackageRootSync({ cwd: "/test/dir" });
      expect(result).toBeNull();
    });
  });
});
