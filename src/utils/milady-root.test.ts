import fsSync from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  resolveMiladyPackageRoot,
  resolveMiladyPackageRootSync,
} from "./milady-root";

const originalReadFile = fs.readFile;
const originalReadFileSync = fsSync.readFileSync;

describe("milady-root", () => {
  let readFileSpy: any;
  let readFileSyncSpy: any;
  let mockedFiles: Record<string, string> = {};

  beforeEach(() => {
    mockedFiles = {};
    readFileSpy = vi.spyOn(fs, "readFile").mockImplementation(async (filepath: any, ...args: any[]) => {
      const fp = String(filepath);
      if (fp.endsWith("package.json")) {
        if (mockedFiles[fp] !== undefined) {
          return mockedFiles[fp];
        }
        throw Object.assign(new Error(`ENOENT`), { code: "ENOENT" });
      }
      return originalReadFile(filepath, ...args);
    });

    readFileSyncSpy = vi.spyOn(fsSync, "readFileSync").mockImplementation((filepath: any, ...args: any[]) => {
      const fp = String(filepath);
      if (fp.endsWith("package.json")) {
        if (mockedFiles[fp] !== undefined) {
          return mockedFiles[fp];
        }
        throw Object.assign(new Error(`ENOENT`), { code: "ENOENT" });
      }
      return originalReadFileSync(filepath, ...args);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("resolveMiladyPackageRoot", () => {
    it("should find the package root from cwd", async () => {
      const mockDir = path.resolve("/some/nested/dir");
      const rootDir = path.resolve("/some");

      mockedFiles[path.join(rootDir, "package.json")] = JSON.stringify({ name: "milady" });
      mockedFiles[path.join(path.resolve("/some/nested"), "package.json")] = JSON.stringify({ name: "other" });

      const result = await resolveMiladyPackageRoot({ cwd: mockDir });
      expect(result).toBe(rootDir);
    });

    it("should find the package root from argv1", async () => {
      const argv1 = path.resolve("/app/bin/start.js");
      const rootDir = path.resolve("/app");

      mockedFiles[path.join(rootDir, "package.json")] = JSON.stringify({ name: "milady" });

      const result = await resolveMiladyPackageRoot({ argv1 });
      expect(result).toBe(rootDir);
    });

    it("should find the package root from moduleUrl", async () => {
      const modulePath = path.resolve("/app/src/index.js");
      const moduleUrl = pathToFileURL(modulePath).toString();
      const rootDir = path.resolve("/app");

      mockedFiles[path.join(rootDir, "package.json")] = JSON.stringify({ name: "milady" });

      const result = await resolveMiladyPackageRoot({ moduleUrl });
      expect(result).toBe(rootDir);
    });

    it("should handle node_modules/.bin in argv1", async () => {
      const argv1 = path.resolve("/app/node_modules/.bin/milady");
      const rootDir = path.resolve("/app");
      const binTargetDir = path.resolve("/app/node_modules/milady");

      mockedFiles[path.join(binTargetDir, "package.json")] = JSON.stringify({ name: "milady" });

      const result = await resolveMiladyPackageRoot({ argv1 });
      expect(result).toBe(binTargetDir);
    });

    it("should return null if not found", async () => {
      const mockDir = path.resolve("/some/nested/dir");

      const result = await resolveMiladyPackageRoot({ cwd: mockDir });
      expect(result).toBeNull();
    });

    it("should handle invalid JSON in package.json", async () => {
      const mockDir = path.resolve("/some/nested/dir");
      const rootDir = path.resolve("/some");

      mockedFiles[path.join(mockDir, "package.json")] = "{ invalid json";
      mockedFiles[path.join(rootDir, "package.json")] = JSON.stringify({ name: "milady" });

      const result = await resolveMiladyPackageRoot({ cwd: mockDir });
      expect(result).toBe(rootDir);
    });
  });

  describe("resolveMiladyPackageRootSync", () => {
    it("should find the package root from cwd", () => {
      const mockDir = path.resolve("/some/nested/dir");
      const rootDir = path.resolve("/some");

      mockedFiles[path.join(rootDir, "package.json")] = JSON.stringify({ name: "milady" });
      mockedFiles[path.join(path.resolve("/some/nested"), "package.json")] = JSON.stringify({ name: "other" });

      const result = resolveMiladyPackageRootSync({ cwd: mockDir });
      expect(result).toBe(rootDir);
    });

    it("should find the package root from argv1", () => {
      const argv1 = path.resolve("/app/bin/start.js");
      const rootDir = path.resolve("/app");

      mockedFiles[path.join(rootDir, "package.json")] = JSON.stringify({ name: "milady" });

      const result = resolveMiladyPackageRootSync({ argv1 });
      expect(result).toBe(rootDir);
    });

    it("should return null if not found", () => {
      const mockDir = path.resolve("/some/nested/dir");

      const result = resolveMiladyPackageRootSync({ cwd: mockDir });
      expect(result).toBeNull();
    });

    it("should handle invalid JSON in package.json", () => {
      const mockDir = path.resolve("/some/nested/dir");
      const rootDir = path.resolve("/some");

      mockedFiles[path.join(mockDir, "package.json")] = "{ invalid json";
      mockedFiles[path.join(rootDir, "package.json")] = JSON.stringify({ name: "milady" });

      const result = resolveMiladyPackageRootSync({ cwd: mockDir });
      expect(result).toBe(rootDir);
    });
  });
});
