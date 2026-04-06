import { describe, expect, it, vi, beforeEach } from "vitest";
import { resolveMiladyPackageRoot, resolveMiladyPackageRootSync } from "./milady-root";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";

vi.mock("node:fs/promises");
vi.mock("node:fs");

describe("milady-root", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("resolveMiladyPackageRoot", () => {
    it("returns null if no package.json matches", async () => {
      vi.mocked(fs.readFile).mockRejectedValue(new Error("enoent"));
      const result = await resolveMiladyPackageRoot({ cwd: "/foo/bar" });
      expect(result).toBeNull();
    });

    it("resolves root when package.json matches in parent directory", async () => {
      vi.mocked(fs.readFile).mockImplementation(async (file) => {
        if (file === path.resolve("/foo/package.json")) {
          return JSON.stringify({ name: "milady" });
        }
        throw new Error("enoent");
      });
      const result = await resolveMiladyPackageRoot({ cwd: "/foo/bar/baz" });
      expect(result).toBe(path.resolve("/foo"));
    });

    it("handles invalid json in package.json", async () => {
      vi.mocked(fs.readFile).mockResolvedValue("invalid json");
      const result = await resolveMiladyPackageRoot({ cwd: "/foo/bar" });
      expect(result).toBeNull();
    });
  });

  describe("resolveMiladyPackageRootSync", () => {
    it("returns null if no package.json matches", () => {
      vi.mocked(fsSync.readFileSync).mockImplementation(() => {
        throw new Error("enoent");
      });
      const result = resolveMiladyPackageRootSync({ cwd: "/foo/bar" });
      expect(result).toBeNull();
    });

    it("resolves root when package.json matches in parent directory", () => {
      vi.mocked(fsSync.readFileSync).mockImplementation((file) => {
        if (file === path.resolve("/foo/package.json")) {
          return JSON.stringify({ name: "milady" });
        }
        throw new Error("enoent");
      });
      const result = resolveMiladyPackageRootSync({ cwd: "/foo/bar/baz" });
      expect(result).toBe(path.resolve("/foo"));
    });

    it("handles invalid json in package.json", () => {
      vi.mocked(fsSync.readFileSync).mockReturnValue("invalid json");
      const result = resolveMiladyPackageRootSync({ cwd: "/foo/bar" });
      expect(result).toBeNull();
    });
  });

  describe("candidate resolution", () => {
    it("resolves based on moduleUrl", async () => {
      const moduleUrl = "file:///foo/bar/baz.js";
      vi.mocked(fs.readFile).mockImplementation(async (file) => {
        if (file === path.resolve("/foo/bar/package.json")) {
          return JSON.stringify({ name: "milady" });
        }
        throw new Error("enoent");
      });
      const result = await resolveMiladyPackageRoot({ moduleUrl });
      expect(result).toBe(path.resolve("/foo/bar"));
    });

    it("resolves based on argv1 bin node_modules", async () => {
      vi.mocked(fs.readFile).mockImplementation(async (file) => {
        if (file === path.resolve("/app/node_modules/cli/package.json")) {
          return JSON.stringify({ name: "milady" });
        }
        throw new Error("enoent");
      });
      const result = await resolveMiladyPackageRoot({ argv1: "/app/node_modules/.bin/cli" });
      expect(result).toBe(path.resolve("/app/node_modules/cli"));
    });

    it("resolves based on argv1 regular path", async () => {
      vi.mocked(fs.readFile).mockImplementation(async (file) => {
        if (file === path.resolve("/app/scripts/package.json")) {
          return JSON.stringify({ name: "milady" });
        }
        throw new Error("enoent");
      });
      const result = await resolveMiladyPackageRoot({ argv1: "/app/scripts/run.js" });
      expect(result).toBe(path.resolve("/app/scripts"));
    });
  });
});
