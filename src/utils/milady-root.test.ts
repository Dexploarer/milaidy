import fsSync from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  resolveMiladyPackageRoot,
  resolveMiladyPackageRootSync,
} from "./milady-root";

describe("milady-root", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("resolveMiladyPackageRoot", () => {
    it("returns null if no options are provided", async () => {
      const root = await resolveMiladyPackageRoot({});
      expect(root).toBeNull();
    });

    it("finds the root using cwd when package.json contains 'milady'", async () => {
      const cwd = "/some/random/path";
      vi.spyOn(fs, "readFile").mockImplementation(async (filePath) => {
        if (filePath === path.join(cwd, "package.json")) {
          return JSON.stringify({ name: "milady" });
        }
        throw new Error("ENOENT");
      });

      const root = await resolveMiladyPackageRoot({ cwd });
      expect(root).toBe(cwd);
    });

    it("traverses up the directory tree to find 'milady' package", async () => {
      const cwd = "/a/b/c/d";
      const rootPath = "/a/b";

      vi.spyOn(fs, "readFile").mockImplementation(async (filePath) => {
        if (filePath === path.join(rootPath, "package.json")) {
          return JSON.stringify({ name: "milady" });
        }
        if (filePath === path.join("/a/b/c", "package.json")) {
          return JSON.stringify({ name: "other" });
        }
        throw new Error("ENOENT");
      });

      const root = await resolveMiladyPackageRoot({ cwd });
      expect(root).toBe(rootPath);
    });

    it("returns null if it reaches max depth without finding 'milady'", async () => {
      const cwd = "/a/b/c/d/e/f/g/h/i/j/k/l/m/n/o";
      vi.spyOn(fs, "readFile").mockImplementation(async () => {
        throw new Error("ENOENT");
      });

      const root = await resolveMiladyPackageRoot({ cwd });
      expect(root).toBeNull();
      // Should check max 12 levels up.
      expect(fs.readFile).toHaveBeenCalledTimes(12);
    });

    it("resolves via argv1 option", async () => {
      const argv1 = "/usr/local/bin/my-script";
      const expectedRoot = "/usr/local/bin";
      vi.spyOn(fs, "readFile").mockImplementation(async (filePath) => {
        if (filePath === path.join(expectedRoot, "package.json")) {
          return JSON.stringify({ name: "milady" });
        }
        throw new Error("ENOENT");
      });

      const root = await resolveMiladyPackageRoot({ argv1 });
      expect(root).toBe(expectedRoot);
    });

    it("resolves via argv1 option with node_modules/.bin structure", async () => {
      const argv1 = "/project/node_modules/.bin/my-bin";
      const expectedRoot = "/project/node_modules/my-bin";

      vi.spyOn(fs, "readFile").mockImplementation(async (filePath) => {
        if (filePath === path.join(expectedRoot, "package.json")) {
          return JSON.stringify({ name: "milady" });
        }
        throw new Error("ENOENT");
      });

      const root = await resolveMiladyPackageRoot({ argv1 });
      expect(root).toBe(expectedRoot);
    });

    it("resolves via moduleUrl option", async () => {
      const moduleUrl = "file:///app/src/index.js";
      const expectedRoot = "/app/src";
      // This path is normalized per OS, so file:///app/src/index.js -> /app/src on Unix
      // Let's use a standard spy
      vi.spyOn(fs, "readFile").mockImplementation(async (filePath) => {
        // Handle OS specific separators
        if (filePath.toString().includes(path.join("app", "src", "package.json"))) {
          return JSON.stringify({ name: "milady" });
        }
        throw new Error("ENOENT");
      });

      const root = await resolveMiladyPackageRoot({ moduleUrl });
      // The exact path depends on Windows vs Unix, but it should contain "app" and "src"
      expect(root).toContain(path.join("app", "src"));
    });

    it("prioritizes moduleUrl, then argv1, then cwd", async () => {
      const moduleUrl = "file:///app/moduleUrl/index.js";
      const argv1 = "/app/argv1/script.js";
      const cwd = "/app/cwd";

      vi.spyOn(fs, "readFile").mockImplementation(async (filePath) => {
        if (filePath.toString().includes("argv1")) {
          return JSON.stringify({ name: "milady" });
        }
        throw new Error("ENOENT");
      });

      const root = await resolveMiladyPackageRoot({ moduleUrl, argv1, cwd });
      expect(root).toContain("argv1");
    });

    it("handles invalid package.json silently", async () => {
      const cwd = "/app/cwd";
      vi.spyOn(fs, "readFile").mockImplementation(async () => {
        return "invalid json";
      });

      const root = await resolveMiladyPackageRoot({ cwd });
      expect(root).toBeNull();
    });

    it("handles package.json without name", async () => {
      const cwd = "/app/cwd";
      vi.spyOn(fs, "readFile").mockImplementation(async () => {
        return JSON.stringify({ version: "1.0.0" });
      });

      const root = await resolveMiladyPackageRoot({ cwd });
      expect(root).toBeNull();
    });
  });

  describe("resolveMiladyPackageRootSync", () => {
    it("returns null if no options are provided", () => {
      const root = resolveMiladyPackageRootSync({});
      expect(root).toBeNull();
    });

    it("finds the root using cwd when package.json contains 'milady'", () => {
      const cwd = "/some/random/path";
      vi.spyOn(fsSync, "readFileSync").mockImplementation((filePath) => {
        if (filePath === path.join(cwd, "package.json")) {
          return JSON.stringify({ name: "milady" });
        }
        throw new Error("ENOENT");
      });

      const root = resolveMiladyPackageRootSync({ cwd });
      expect(root).toBe(cwd);
    });

    it("traverses up the directory tree to find 'milady' package", () => {
      const cwd = "/a/b/c/d";
      const rootPath = "/a/b";

      vi.spyOn(fsSync, "readFileSync").mockImplementation((filePath) => {
        if (filePath === path.join(rootPath, "package.json")) {
          return JSON.stringify({ name: "milady" });
        }
        if (filePath === path.join("/a/b/c", "package.json")) {
          return JSON.stringify({ name: "other" });
        }
        throw new Error("ENOENT");
      });

      const root = resolveMiladyPackageRootSync({ cwd });
      expect(root).toBe(rootPath);
    });

    it("returns null if it reaches max depth without finding 'milady'", () => {
      const cwd = "/a/b/c/d/e/f/g/h/i/j/k/l/m/n/o";
      vi.spyOn(fsSync, "readFileSync").mockImplementation(() => {
        throw new Error("ENOENT");
      });

      const root = resolveMiladyPackageRootSync({ cwd });
      expect(root).toBeNull();
      // Should check max 12 levels up.
      expect(fsSync.readFileSync).toHaveBeenCalledTimes(12);
    });

    it("resolves via argv1 option", () => {
      const argv1 = "/usr/local/bin/my-script";
      const expectedRoot = "/usr/local/bin";
      vi.spyOn(fsSync, "readFileSync").mockImplementation((filePath) => {
        if (filePath === path.join(expectedRoot, "package.json")) {
          return JSON.stringify({ name: "milady" });
        }
        throw new Error("ENOENT");
      });

      const root = resolveMiladyPackageRootSync({ argv1 });
      expect(root).toBe(expectedRoot);
    });

    it("resolves via moduleUrl option", () => {
      const moduleUrl = "file:///app/src/index.js";
      vi.spyOn(fsSync, "readFileSync").mockImplementation((filePath) => {
        if (filePath.toString().includes(path.join("app", "src", "package.json"))) {
          return JSON.stringify({ name: "milady" });
        }
        throw new Error("ENOENT");
      });

      const root = resolveMiladyPackageRootSync({ moduleUrl });
      expect(root).toContain(path.join("app", "src"));
    });

    it("handles invalid package.json silently", () => {
      const cwd = "/app/cwd";
      vi.spyOn(fsSync, "readFileSync").mockImplementation(() => {
        return "invalid json";
      });

      const root = resolveMiladyPackageRootSync({ cwd });
      expect(root).toBeNull();
    });
  });
});
