import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { resolveMiladyPackageRoot, resolveMiladyPackageRootSync } from "./milady-root";
import fsSync from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Mock the node modules
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
  const mockPackageJsonMilady = JSON.stringify({ name: "milady" });
  const mockPackageJsonOther = JSON.stringify({ name: "other" });
  const mockPackageJsonInvalid = "invalid json";

  beforeEach(() => {
    vi.resetAllMocks();

    // Default URL mock implementation
    vi.mocked(fileURLToPath).mockImplementation((url) => {
      if (url === "file:///app/src/utils/test.ts") return "/app/src/utils/test.ts";
      if (url === "file:///app/test.ts") return "/app/test.ts";
      return "/app/test.ts";
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("resolveMiladyPackageRoot", () => {
    it("returns null if no candidates provided", async () => {
      const result = await resolveMiladyPackageRoot({});
      expect(result).toBeNull();
    });

    it("resolves from cwd", async () => {
      vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
        if (filePath === path.join("/app/src/utils", "package.json")) return mockPackageJsonOther;
        if (filePath === path.join("/app/src", "package.json")) return mockPackageJsonOther;
        if (filePath === path.join("/app", "package.json")) return mockPackageJsonMilady;
        throw new Error("File not found");
      });

      const result = await resolveMiladyPackageRoot({ cwd: "/app/src/utils" });
      expect(result).toBe("/app");
    });

    it("resolves from argv1", async () => {
      vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
        if (filePath === path.join("/app/bin/some-cli", "package.json")) return mockPackageJsonOther;
        if (filePath === path.join("/app/bin", "package.json")) return mockPackageJsonOther;
        if (filePath === path.join("/app", "package.json")) return mockPackageJsonMilady;
        throw new Error("File not found");
      });

      const result = await resolveMiladyPackageRoot({ argv1: "/app/bin/some-cli" });
      expect(result).toBe("/app");
    });

    it("handles bin inside node_modules in argv1", async () => {
      vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
        if (filePath === path.join("/app/node_modules/my-tool", "package.json")) return mockPackageJsonMilady;
        throw new Error("File not found");
      });

      const result = await resolveMiladyPackageRoot({ argv1: "/app/node_modules/.bin/my-tool" });
      expect(result).toBe("/app/node_modules/my-tool");
    });

    it("resolves from moduleUrl", async () => {
      vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
        if (filePath === path.join("/app/src/utils", "package.json")) return mockPackageJsonOther;
        if (filePath === path.join("/app/src", "package.json")) return mockPackageJsonOther;
        if (filePath === path.join("/app", "package.json")) return mockPackageJsonMilady;
        throw new Error("File not found");
      });

      const result = await resolveMiladyPackageRoot({ moduleUrl: "file:///app/src/utils/test.ts" });
      expect(result).toBe("/app");
    });

    it("returns null if not found", async () => {
      vi.mocked(fs.readFile).mockImplementation(async () => {
        throw new Error("File not found");
      });

      const result = await resolveMiladyPackageRoot({ cwd: "/app/src" });
      expect(result).toBeNull();
    });

    it("returns null if max depth is reached without finding milady", async () => {
       vi.mocked(fs.readFile).mockImplementation(async () => {
         return mockPackageJsonOther;
       });

       const result = await resolveMiladyPackageRoot({ cwd: "/a/b/c/d/e/f/g/h/i/j/k/l/m/n/o/p" });
       expect(result).toBeNull();
    });

    it("ignores invalid package.json", async () => {
      vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
        if (filePath === path.join("/app/src", "package.json")) return mockPackageJsonInvalid;
        if (filePath === path.join("/app", "package.json")) return mockPackageJsonMilady;
        throw new Error("File not found");
      });

      const result = await resolveMiladyPackageRoot({ cwd: "/app/src" });
      expect(result).toBe("/app");
    });

    it("ignores package.json without a string name", async () => {
      vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
        if (filePath === path.join("/app/src", "package.json")) return JSON.stringify({ name: 123 });
        if (filePath === path.join("/app", "package.json")) return mockPackageJsonMilady;
        throw new Error("File not found");
      });

      const result = await resolveMiladyPackageRoot({ cwd: "/app/src" });
      expect(result).toBe("/app");
    });
  });

  describe("resolveMiladyPackageRootSync", () => {
    it("returns null if no candidates provided", () => {
      const result = resolveMiladyPackageRootSync({});
      expect(result).toBeNull();
    });

    it("resolves from cwd", () => {
      vi.mocked(fsSync.readFileSync).mockImplementation((filePath) => {
        if (filePath === path.join("/app/src/utils", "package.json")) return mockPackageJsonOther;
        if (filePath === path.join("/app/src", "package.json")) return mockPackageJsonOther;
        if (filePath === path.join("/app", "package.json")) return mockPackageJsonMilady;
        throw new Error("File not found");
      });

      const result = resolveMiladyPackageRootSync({ cwd: "/app/src/utils" });
      expect(result).toBe("/app");
    });

    it("resolves from argv1", () => {
      vi.mocked(fsSync.readFileSync).mockImplementation((filePath) => {
        if (filePath === path.join("/app/bin/some-cli", "package.json")) return mockPackageJsonOther;
        if (filePath === path.join("/app/bin", "package.json")) return mockPackageJsonOther;
        if (filePath === path.join("/app", "package.json")) return mockPackageJsonMilady;
        throw new Error("File not found");
      });

      const result = resolveMiladyPackageRootSync({ argv1: "/app/bin/some-cli" });
      expect(result).toBe("/app");
    });

    it("handles bin inside node_modules in argv1", () => {
      vi.mocked(fsSync.readFileSync).mockImplementation((filePath) => {
        if (filePath === path.join("/app/node_modules/my-tool", "package.json")) return mockPackageJsonMilady;
        throw new Error("File not found");
      });

      const result = resolveMiladyPackageRootSync({ argv1: "/app/node_modules/.bin/my-tool" });
      expect(result).toBe("/app/node_modules/my-tool");
    });

    it("resolves from moduleUrl", () => {
      vi.mocked(fsSync.readFileSync).mockImplementation((filePath) => {
        if (filePath === path.join("/app/src/utils", "package.json")) return mockPackageJsonOther;
        if (filePath === path.join("/app/src", "package.json")) return mockPackageJsonOther;
        if (filePath === path.join("/app", "package.json")) return mockPackageJsonMilady;
        throw new Error("File not found");
      });

      const result = resolveMiladyPackageRootSync({ moduleUrl: "file:///app/src/utils/test.ts" });
      expect(result).toBe("/app");
    });

    it("returns null if not found", () => {
      vi.mocked(fsSync.readFileSync).mockImplementation(() => {
        throw new Error("File not found");
      });

      const result = resolveMiladyPackageRootSync({ cwd: "/app/src" });
      expect(result).toBeNull();
    });

    it("returns null if max depth is reached without finding milady", () => {
       vi.mocked(fsSync.readFileSync).mockImplementation(() => {
         return mockPackageJsonOther;
       });

       const result = resolveMiladyPackageRootSync({ cwd: "/a/b/c/d/e/f/g/h/i/j/k/l/m/n/o/p" });
       expect(result).toBeNull();
    });

    it("ignores invalid package.json", () => {
      vi.mocked(fsSync.readFileSync).mockImplementation((filePath) => {
        if (filePath === path.join("/app/src", "package.json")) return mockPackageJsonInvalid;
        if (filePath === path.join("/app", "package.json")) return mockPackageJsonMilady;
        throw new Error("File not found");
      });

      const result = resolveMiladyPackageRootSync({ cwd: "/app/src" });
      expect(result).toBe("/app");
    });

    it("ignores package.json without a string name", () => {
      vi.mocked(fsSync.readFileSync).mockImplementation((filePath) => {
        if (filePath === path.join("/app/src", "package.json")) return JSON.stringify({ name: 123 });
        if (filePath === path.join("/app", "package.json")) return mockPackageJsonMilady;
        throw new Error("File not found");
      });

      const result = resolveMiladyPackageRootSync({ cwd: "/app/src" });
      expect(result).toBe("/app");
    });
  });
});
