import { afterEach, describe, expect, it, vi } from "vitest";
import fsSync from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
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
    vi.resetAllMocks();
  });

  describe("resolveMiladyPackageRoot", () => {
    it("returns null when no package.json is found", async () => {
      vi.mocked(fs.readFile).mockRejectedValue(new Error("ENOENT"));
      const result = await resolveMiladyPackageRoot({ cwd: "/unknown/path" });
      expect(result).toBeNull();
    });

    it("returns null when package.json does not have name 'milady'", async () => {
      vi.mocked(fs.readFile).mockResolvedValue(
        JSON.stringify({ name: "not-milady" })
      );
      const result = await resolveMiladyPackageRoot({ cwd: "/unknown/path" });
      expect(result).toBeNull();
    });

    it("returns root directory when package.json has name 'milady'", async () => {
      const mockDir = path.resolve("/app/milady");
      vi.mocked(fs.readFile).mockImplementation(async (filepath) => {
        if (filepath.toString() === path.join(mockDir, "package.json")) {
          return JSON.stringify({ name: "milady" });
        }
        throw new Error("ENOENT");
      });

      const result = await resolveMiladyPackageRoot({ cwd: path.join(mockDir, "src/utils") });
      expect(result).toBe(mockDir);
    });

    it("finds root from argv1 pointing to a script in node_modules/.bin", async () => {
      const projectRoot = path.resolve("/app/my-project");
      const argv1 = path.join(projectRoot, "node_modules/.bin/milady");

      vi.mocked(fs.readFile).mockImplementation(async (filepath) => {
        if (filepath.toString() === path.join(projectRoot, "package.json")) {
          return JSON.stringify({ name: "milady" });
        }
        throw new Error("ENOENT");
      });

      const result = await resolveMiladyPackageRoot({ argv1 });
      expect(result).toBe(projectRoot);
    });

    it("finds root from moduleUrl", async () => {
      const mockDir = path.resolve("/app/milady");
      // Use file:/// schema for moduleUrl
      const moduleUrl = `file://${path.join(mockDir, "src/utils/test.ts")}`;

      vi.mocked(fs.readFile).mockImplementation(async (filepath) => {
        if (filepath.toString() === path.join(mockDir, "package.json")) {
          return JSON.stringify({ name: "milady" });
        }
        throw new Error("ENOENT");
      });

      const result = await resolveMiladyPackageRoot({ moduleUrl });
      expect(result).toBe(mockDir);
    });
  });

  describe("resolveMiladyPackageRootSync", () => {
    it("returns null when no package.json is found", () => {
      vi.mocked(fsSync.readFileSync).mockImplementation(() => {
        throw new Error("ENOENT");
      });
      const result = resolveMiladyPackageRootSync({ cwd: "/unknown/path" });
      expect(result).toBeNull();
    });

    it("returns null when package.json does not have name 'milady'", () => {
      vi.mocked(fsSync.readFileSync).mockReturnValue(
        JSON.stringify({ name: "not-milady" })
      );
      const result = resolveMiladyPackageRootSync({ cwd: "/unknown/path" });
      expect(result).toBeNull();
    });

    it("returns root directory when package.json has name 'milady'", () => {
      const mockDir = path.resolve("/app/milady");
      vi.mocked(fsSync.readFileSync).mockImplementation((filepath) => {
        if (filepath.toString() === path.join(mockDir, "package.json")) {
          return JSON.stringify({ name: "milady" });
        }
        throw new Error("ENOENT");
      });

      const result = resolveMiladyPackageRootSync({ cwd: path.join(mockDir, "src/utils") });
      expect(result).toBe(mockDir);
    });

    it("finds root from argv1 pointing to a script in node_modules/.bin", () => {
      const projectRoot = path.resolve("/app/my-project");
      const argv1 = path.join(projectRoot, "node_modules/.bin/milady");

      vi.mocked(fsSync.readFileSync).mockImplementation((filepath) => {
        if (filepath.toString() === path.join(projectRoot, "package.json")) {
          return JSON.stringify({ name: "milady" });
        }
        throw new Error("ENOENT");
      });

      const result = resolveMiladyPackageRootSync({ argv1 });
      expect(result).toBe(projectRoot);
    });

    it("finds root from moduleUrl", () => {
      const mockDir = path.resolve("/app/milady");
      const moduleUrl = `file://${path.join(mockDir, "src/utils/test.ts")}`;

      vi.mocked(fsSync.readFileSync).mockImplementation((filepath) => {
        if (filepath.toString() === path.join(mockDir, "package.json")) {
          return JSON.stringify({ name: "milady" });
        }
        throw new Error("ENOENT");
      });

      const result = resolveMiladyPackageRootSync({ moduleUrl });
      expect(result).toBe(mockDir);
    });
  });
});
