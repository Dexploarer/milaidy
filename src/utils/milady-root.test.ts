import fsSync from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  resolveMiladyPackageRoot,
  resolveMiladyPackageRootSync,
} from "./milady-root";

vi.mock("node:fs/promises");
vi.mock("node:fs");

describe("resolveMiladyPackageRoot", () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it("should find root from cwd", async () => {
    const mockedRead = vi.mocked(fs.readFile);
    mockedRead.mockImplementation(async (filePath) => {
      if (filePath.toString().includes("my-project/package.json")) {
        return JSON.stringify({ name: "milady" });
      }
      return JSON.stringify({ name: "something-else" });
    });

    const result = await resolveMiladyPackageRoot({
      cwd: "/home/user/my-project/src/some/deep/path",
    });
    expect(result).toBe(path.resolve("/home/user/my-project"));
  });

  it("should return null if not found", async () => {
    const mockedRead = vi.mocked(fs.readFile);
    mockedRead.mockImplementation(async () => {
      return JSON.stringify({ name: "something-else" });
    });

    const result = await resolveMiladyPackageRoot({
      cwd: "/home/user/my-project/src",
    });
    expect(result).toBeNull();
  });

  it("should ignore unparseable json", async () => {
    const mockedRead = vi.mocked(fs.readFile);
    mockedRead.mockImplementation(async () => {
      return "invalid json";
    });

    const result = await resolveMiladyPackageRoot({
      cwd: "/home/user/my-project/src",
    });
    expect(result).toBeNull();
  });

  it("should find root from moduleUrl", async () => {
    const mockedRead = vi.mocked(fs.readFile);
    mockedRead.mockImplementation(async (filePath) => {
      if (filePath.toString().includes("my-project/package.json")) {
        return JSON.stringify({ name: "milady" });
      }
      return JSON.stringify({ name: "something-else" });
    });

    const moduleUrl = "file:///home/user/my-project/src/index.js";
    const result = await resolveMiladyPackageRoot({ moduleUrl });
    expect(result).toBe(path.resolve("/home/user/my-project"));
  });

  it("should fallback to argv1 when cwd fails", async () => {
    const mockedRead = vi.mocked(fs.readFile);
    mockedRead.mockImplementation(async (filePath) => {
      if (filePath.toString().includes("my-project/package.json")) {
        return JSON.stringify({ name: "milady" });
      }
      return JSON.stringify({ name: "something-else" });
    });

    const result = await resolveMiladyPackageRoot({
      cwd: "/tmp/other",
      argv1: "/home/user/my-project/bin/cli.js",
    });
    expect(result).toBe(path.resolve("/home/user/my-project"));
  });

  it("should resolve from .bin structure", async () => {
    const mockedRead = vi.mocked(fs.readFile);
    mockedRead.mockImplementation(async (filePath) => {
      if (
        filePath
          .toString()
          .includes("my-project/node_modules/my-cli/package.json")
      ) {
        return JSON.stringify({ name: "milady" });
      }
      return JSON.stringify({ name: "something-else" });
    });

    const result = await resolveMiladyPackageRoot({
      argv1: "/home/user/my-project/node_modules/.bin/my-cli",
    });
    expect(result).toBe(
      path.resolve("/home/user/my-project/node_modules/my-cli"),
    );
  });

  it("should handle fs throwing", async () => {
    const mockedRead = vi.mocked(fs.readFile);
    mockedRead.mockImplementation(async () => {
      throw new Error("ENOENT");
    });

    const result = await resolveMiladyPackageRoot({
      cwd: "/home/user/my-project/src",
    });
    expect(result).toBeNull();
  });

  it("should handle package.json with no name string", async () => {
    const mockedRead = vi.mocked(fs.readFile);
    mockedRead.mockImplementation(async () => {
      return JSON.stringify({ name: 123 });
    });

    const result = await resolveMiladyPackageRoot({
      cwd: "/home/user/my-project/src",
    });
    expect(result).toBeNull();
  });

  it("should stop listing ancestor dirs when hitting root", async () => {
    const mockedRead = vi.mocked(fs.readFile);
    mockedRead.mockImplementation(async () => {
      return JSON.stringify({ name: "something-else" });
    });

    await resolveMiladyPackageRoot({ cwd: "/" });
    expect(mockedRead).toHaveBeenCalled();
  });
});

describe("resolveMiladyPackageRootSync", () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it("should find root from cwd", () => {
    const mockedReadSync = vi.mocked(fsSync.readFileSync);
    mockedReadSync.mockImplementation((filePath) => {
      if (filePath.toString().includes("my-project/package.json")) {
        return JSON.stringify({ name: "milady" });
      }
      return JSON.stringify({ name: "something-else" });
    });

    const result = resolveMiladyPackageRootSync({
      cwd: "/home/user/my-project/src/some/deep/path",
    });
    expect(result).toBe(path.resolve("/home/user/my-project"));
  });

  it("should return null if not found", () => {
    const mockedReadSync = vi.mocked(fsSync.readFileSync);
    mockedReadSync.mockImplementation(() => {
      return JSON.stringify({ name: "something-else" });
    });

    const result = resolveMiladyPackageRootSync({
      cwd: "/home/user/my-project/src",
    });
    expect(result).toBeNull();
  });

  it("should ignore unparseable json", () => {
    const mockedReadSync = vi.mocked(fsSync.readFileSync);
    mockedReadSync.mockImplementation(() => {
      return "invalid json";
    });

    const result = resolveMiladyPackageRootSync({
      cwd: "/home/user/my-project/src",
    });
    expect(result).toBeNull();
  });

  it("should fallback to argv1 when cwd fails", () => {
    const mockedReadSync = vi.mocked(fsSync.readFileSync);
    mockedReadSync.mockImplementation((filePath) => {
      if (filePath.toString().includes("my-project/package.json")) {
        return JSON.stringify({ name: "milady" });
      }
      return JSON.stringify({ name: "something-else" });
    });

    const result = resolveMiladyPackageRootSync({
      cwd: "/tmp/other",
      argv1: "/home/user/my-project/bin/cli.js",
    });
    expect(result).toBe(path.resolve("/home/user/my-project"));
  });

  it("should find root from moduleUrl", () => {
    const mockedReadSync = vi.mocked(fsSync.readFileSync);
    mockedReadSync.mockImplementation((filePath) => {
      if (filePath.toString().includes("my-project/package.json")) {
        return JSON.stringify({ name: "milady" });
      }
      return JSON.stringify({ name: "something-else" });
    });

    const moduleUrl = "file:///home/user/my-project/src/index.js";
    const result = resolveMiladyPackageRootSync({ moduleUrl });
    expect(result).toBe(path.resolve("/home/user/my-project"));
  });

  it("should handle fs throwing", () => {
    const mockedReadSync = vi.mocked(fsSync.readFileSync);
    mockedReadSync.mockImplementation(() => {
      throw new Error("ENOENT");
    });

    const result = resolveMiladyPackageRootSync({
      cwd: "/home/user/my-project/src",
    });
    expect(result).toBeNull();
  });

  it("should handle package.json with no name string", () => {
    const mockedReadSync = vi.mocked(fsSync.readFileSync);
    mockedReadSync.mockImplementation(() => {
      return JSON.stringify({ name: 123 });
    });

    const result = resolveMiladyPackageRootSync({
      cwd: "/home/user/my-project/src",
    });
    expect(result).toBeNull();
  });

  it("should return null with empty options", () => {
    const result = resolveMiladyPackageRootSync({});
    expect(result).toBeNull();
  });
});
