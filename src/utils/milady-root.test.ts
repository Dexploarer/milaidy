import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fsSync from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveMiladyPackageRoot, resolveMiladyPackageRootSync } from "./milady-root.js";

describe("milady-root", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("resolveMiladyPackageRoot", () => {
    it("should resolve root from cwd", async () => {
      vi.spyOn(fs, "readFile").mockImplementation(async (filePath) => {
        if (filePath === path.join(path.resolve("/a/b/c"), "package.json")) {
          return JSON.stringify({ name: "milady" });
        }
        throw new Error("ENOENT");
      });

      const result = await resolveMiladyPackageRoot({ cwd: "/a/b/c" });
      expect(result).toBe(path.resolve("/a/b/c"));
    });

    it("should resolve root from ancestor of cwd", async () => {
      vi.spyOn(fs, "readFile").mockImplementation(async (filePath) => {
        if (filePath === path.join(path.resolve("/a/b"), "package.json")) {
          return JSON.stringify({ name: "milady" });
        }
        throw new Error("ENOENT");
      });

      const result = await resolveMiladyPackageRoot({ cwd: "/a/b/c/d" });
      expect(result).toBe(path.resolve("/a/b"));
    });

    it("should resolve root from argv1 (normal)", async () => {
      vi.spyOn(fs, "readFile").mockImplementation(async (filePath) => {
        if (filePath === path.join(path.resolve("/usr/local/bin"), "package.json")) {
          return JSON.stringify({ name: "milady" });
        }
        throw new Error("ENOENT");
      });

      const result = await resolveMiladyPackageRoot({ argv1: "/usr/local/bin/milady" });
      expect(result).toBe(path.resolve("/usr/local/bin"));
    });

    it("should resolve root from argv1 (node_modules/.bin)", async () => {
      vi.spyOn(fs, "readFile").mockImplementation(async (filePath) => {
        if (filePath === path.join(path.resolve("/project/node_modules/milady"), "package.json")) {
          return JSON.stringify({ name: "milady" });
        }
        throw new Error("ENOENT");
      });

      const result = await resolveMiladyPackageRoot({ argv1: "/project/node_modules/.bin/milady" });
      expect(result).toBe(path.resolve("/project/node_modules/milady"));
    });

    it("should resolve root from moduleUrl", async () => {
      vi.spyOn(fs, "readFile").mockImplementation(async (filePath) => {
        if (filePath === path.join(path.resolve(path.dirname(new URL("file:///app/src/index.js").pathname)), "package.json")) {
          return JSON.stringify({ name: "milady" });
        }
        throw new Error("ENOENT");
      });

      const result = await resolveMiladyPackageRoot({ moduleUrl: "file:///app/src/index.js" });
      // Note: On Windows, file:///app/src/index.js becomes something else, so it's safer to not hardcode expect string
      // but let's check correctly
      expect(result).toBeTruthy();
      if (result) {
        expect(result.endsWith("src")).toBe(true);
      }
    });

    it("should return null if no package.json is found", async () => {
      vi.spyOn(fs, "readFile").mockImplementation(async () => {
        throw new Error("ENOENT");
      });

      const result = await resolveMiladyPackageRoot({ cwd: "/a/b/c" });
      expect(result).toBeNull();
    });

    it("should return null if package.json has a different name", async () => {
      vi.spyOn(fs, "readFile").mockImplementation(async (filePath) => {
        if (filePath === path.join(path.resolve("/a/b/c"), "package.json")) {
          return JSON.stringify({ name: "other-package" });
        }
        throw new Error("ENOENT");
      });

      const result = await resolveMiladyPackageRoot({ cwd: "/a/b/c" });
      expect(result).toBeNull();
    });
  });

  describe("resolveMiladyPackageRootSync", () => {
    it("should resolve root from cwd", () => {
      vi.spyOn(fsSync, "readFileSync").mockImplementation((filePath) => {
        if (filePath === path.join(path.resolve("/a/b/c"), "package.json")) {
          return JSON.stringify({ name: "milady" });
        }
        throw new Error("ENOENT");
      });

      const result = resolveMiladyPackageRootSync({ cwd: "/a/b/c" });
      expect(result).toBe(path.resolve("/a/b/c"));
    });

    it("should resolve root from ancestor of cwd", () => {
      vi.spyOn(fsSync, "readFileSync").mockImplementation((filePath) => {
        if (filePath === path.join(path.resolve("/a/b"), "package.json")) {
          return JSON.stringify({ name: "milady" });
        }
        throw new Error("ENOENT");
      });

      const result = resolveMiladyPackageRootSync({ cwd: "/a/b/c/d" });
      expect(result).toBe(path.resolve("/a/b"));
    });

    it("should resolve root from argv1 (normal)", () => {
      vi.spyOn(fsSync, "readFileSync").mockImplementation((filePath) => {
        if (filePath === path.join(path.resolve("/usr/local/bin"), "package.json")) {
          return JSON.stringify({ name: "milady" });
        }
        throw new Error("ENOENT");
      });

      const result = resolveMiladyPackageRootSync({ argv1: "/usr/local/bin/milady" });
      expect(result).toBe(path.resolve("/usr/local/bin"));
    });

    it("should resolve root from argv1 (node_modules/.bin)", () => {
      vi.spyOn(fsSync, "readFileSync").mockImplementation((filePath) => {
        if (filePath === path.join(path.resolve("/project/node_modules/milady"), "package.json")) {
          return JSON.stringify({ name: "milady" });
        }
        throw new Error("ENOENT");
      });

      const result = resolveMiladyPackageRootSync({ argv1: "/project/node_modules/.bin/milady" });
      expect(result).toBe(path.resolve("/project/node_modules/milady"));
    });

    it("should resolve root from moduleUrl", () => {
      vi.spyOn(fsSync, "readFileSync").mockImplementation((filePath) => {
        if (filePath === path.join(path.resolve(path.dirname(new URL("file:///app/src/index.js").pathname)), "package.json")) {
          return JSON.stringify({ name: "milady" });
        }
        throw new Error("ENOENT");
      });

      const result = resolveMiladyPackageRootSync({ moduleUrl: "file:///app/src/index.js" });
      expect(result).toBeTruthy();
      if (result) {
        expect(result.endsWith("src")).toBe(true);
      }
    });

    it("should return null if no package.json is found", () => {
      vi.spyOn(fsSync, "readFileSync").mockImplementation(() => {
        throw new Error("ENOENT");
      });

      const result = resolveMiladyPackageRootSync({ cwd: "/a/b/c" });
      expect(result).toBeNull();
    });

    it("should return null if package.json has a different name", () => {
      vi.spyOn(fsSync, "readFileSync").mockImplementation((filePath) => {
        if (filePath === path.join(path.resolve("/a/b/c"), "package.json")) {
          return JSON.stringify({ name: "other-package" });
        }
        throw new Error("ENOENT");
      });

      const result = resolveMiladyPackageRootSync({ cwd: "/a/b/c" });
      expect(result).toBeNull();
    });

    it("should prioritize candidates in order: moduleUrl, argv1, cwd", () => {
      const pathsChecked: string[] = [];
      vi.spyOn(fsSync, "readFileSync").mockImplementation((filePath) => {
        pathsChecked.push(filePath as string);
        throw new Error("ENOENT");
      });

      resolveMiladyPackageRootSync({
        moduleUrl: "file:///app/src/index.js",
        argv1: "/project/node_modules/.bin/milady",
        cwd: "/a/b/c"
      });

      expect(pathsChecked.length).toBeGreaterThan(0);
      expect(pathsChecked[0]).toBe(path.join(path.resolve(path.dirname(new URL("file:///app/src/index.js").pathname)), "package.json"));
    });
  });
});
