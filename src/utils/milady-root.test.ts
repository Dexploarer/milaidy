import fsSync from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  resolveMiladyPackageRoot,
  resolveMiladyPackageRootSync,
} from "./milady-root";

describe("milady-root", () => {
  it("resolves root asynchronously using cwd", async () => {
    vi.spyOn(fs, "readFile").mockImplementation(async (filePath) => {
      if (filePath.toString().includes("mock-root")) {
        return JSON.stringify({ name: "milady" });
      }
      return JSON.stringify({ name: "other" });
    });

    const root = await resolveMiladyPackageRoot({
      cwd: path.join("mock-root", "subdir"),
    });
    expect(root).toContain("mock-root");
  });

  it("resolves root synchronously using cwd", () => {
    vi.spyOn(fsSync, "readFileSync").mockImplementation((filePath) => {
      if (filePath.toString().includes("mock-root")) {
        return JSON.stringify({ name: "milady" });
      }
      return JSON.stringify({ name: "other" });
    });

    const root = resolveMiladyPackageRootSync({
      cwd: path.join("mock-root", "subdir"),
    });
    expect(root).toContain("mock-root");
  });

  it("handles fs.readFile throwing errors gracefully", async () => {
    vi.spyOn(fs, "readFile").mockImplementation(async () => {
      throw new Error("Cannot read file");
    });
    const root = await resolveMiladyPackageRoot({
      cwd: path.join("error-root", "subdir"),
    });
    expect(root).toBeNull();
  });

  it("handles fsSync.readFileSync throwing errors gracefully", () => {
    vi.spyOn(fsSync, "readFileSync").mockImplementation(() => {
      throw new Error("Cannot read file");
    });
    const root = resolveMiladyPackageRootSync({
      cwd: path.join("error-root", "subdir"),
    });
    expect(root).toBeNull();
  });

  it("returns null if reaching max depth without finding root async", async () => {
    vi.spyOn(fs, "readFile").mockImplementation(async () => {
      return JSON.stringify({ name: "other" });
    });

    const root = await resolveMiladyPackageRoot({
      cwd: path.join("/deep", "dir", "structure", "without", "root"),
    });
    expect(root).toBeNull();
  });

  it("returns null if reaching max depth without finding root sync", () => {
    vi.spyOn(fsSync, "readFileSync").mockImplementation(() => {
      return JSON.stringify({ name: "other" });
    });

    const root = resolveMiladyPackageRootSync({
      cwd: path.join("/deep", "dir", "structure", "without", "root"),
    });
    expect(root).toBeNull();
  });

  it("resolves from argv1 path", async () => {
    vi.spyOn(fs, "readFile").mockImplementation(async (filePath) => {
      if (filePath.toString().includes("project")) {
        return JSON.stringify({ name: "milady" });
      }
      return JSON.stringify({ name: "other" });
    });
    const root = await resolveMiladyPackageRoot({
      argv1: path.join("project", "node_modules", ".bin", "cli"),
    });
    expect(root).toContain("project");
  });

  it("resolves from moduleUrl", async () => {
    vi.spyOn(fs, "readFile").mockImplementation(async (filePath) => {
      if (filePath.toString().includes("module-root")) {
        return JSON.stringify({ name: "milady" });
      }
      return JSON.stringify({ name: "other" });
    });
    const root = await resolveMiladyPackageRoot({
      moduleUrl: `file://${path.resolve("module-root/file.js")}`,
    });
    expect(root).toContain("module-root");
  });

  it("handles invalid json from readFileSync", () => {
    vi.spyOn(fsSync, "readFileSync").mockImplementation((filePath) => {
      if (filePath.toString().includes("bad-json-root")) {
        return "invalid json";
      }
      return JSON.stringify({ name: "other" });
    });

    const root = resolveMiladyPackageRootSync({
      cwd: path.join("bad-json-root", "subdir"),
    });
    expect(root).toBeNull();
  });

  it("handles invalid json from readFile", async () => {
    vi.spyOn(fs, "readFile").mockImplementation(async (filePath) => {
      if (filePath.toString().includes("bad-json-root")) {
        return "invalid json";
      }
      return JSON.stringify({ name: "other" });
    });

    const root = await resolveMiladyPackageRoot({
      cwd: path.join("bad-json-root", "subdir"),
    });
    expect(root).toBeNull();
  });
});
