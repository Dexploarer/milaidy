import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveMiladyVersion } from "./version-resolver";

vi.mock("node:module", () => {
  return {
    createRequire: vi.fn(() => {
      return vi.fn();
    }),
  };
});

describe("resolveMiladyVersion", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    // Clear global variables if any
    (globalThis as Record<string, unknown>).__MILADY_VERSION__ = undefined;
  });

  afterEach(() => {
    process.env = originalEnv;
    delete (globalThis as Record<string, unknown>).__MILADY_VERSION__;
    vi.clearAllMocks();
  });

  it("should return version from __MILADY_VERSION__ if available", () => {
    (globalThis as Record<string, unknown>).__MILADY_VERSION__ = "1.0.0-global";
    expect(resolveMiladyVersion("file:///test")).toBe("1.0.0-global");
  });

  it("should return version from process.env.MILADY_BUNDLED_VERSION", () => {
    process.env.MILADY_BUNDLED_VERSION = "2.0.0-env";
    expect(resolveMiladyVersion("file:///test")).toBe("2.0.0-env");
  });

  it("should return fallback 0.0.0 if nothing else works", async () => {
    const { createRequire } = await import("node:module");
    const mockRequire = vi.fn().mockImplementation((id: string) => {
      const err = new Error(
        `Cannot find module '${id}'`,
      ) as NodeJS.ErrnoException;
      err.code = "MODULE_NOT_FOUND";
      throw err;
    });
    vi.mocked(createRequire).mockReturnValue(
      mockRequire as unknown as NodeRequire,
    );

    expect(resolveMiladyVersion("file:///test")).toBe("0.0.0");
  });

  it("should read version from package.json", async () => {
    const { createRequire } = await import("node:module");
    const mockRequire = vi.fn().mockImplementation((id: string) => {
      if (id === "../../package.json") {
        return { version: "3.0.0-package" };
      }
      const err = new Error(
        `Cannot find module '${id}'`,
      ) as NodeJS.ErrnoException;
      err.code = "MODULE_NOT_FOUND";
      throw err;
    });
    vi.mocked(createRequire).mockReturnValue(
      mockRequire as unknown as NodeRequire,
    );

    expect(resolveMiladyVersion("file:///test")).toBe("3.0.0-package");
  });

  it("should read version from build-info.json candidates if package.json fails", async () => {
    const { createRequire } = await import("node:module");
    const mockRequire = vi.fn().mockImplementation((id: string) => {
      if (id === "../build-info.json") {
        return { version: "4.0.0-build" };
      }
      const err = new Error(
        `Cannot find module '${id}'`,
      ) as NodeJS.ErrnoException;
      err.code = "MODULE_NOT_FOUND";
      throw err;
    });
    vi.mocked(createRequire).mockReturnValue(
      mockRequire as unknown as NodeRequire,
    );

    expect(resolveMiladyVersion("file:///test")).toBe("4.0.0-build");
  });

  it("should throw non-MODULE_NOT_FOUND errors from package.json read", async () => {
    const { createRequire } = await import("node:module");
    const mockRequire = vi.fn().mockImplementation((id: string) => {
      if (id === "../../package.json") {
        throw new Error("Some fatal error");
      }
      return {};
    });
    vi.mocked(createRequire).mockReturnValue(
      mockRequire as unknown as NodeRequire,
    );

    expect(() => resolveMiladyVersion("file:///test")).toThrow(
      "Some fatal error",
    );
  });

  it("should throw non-MODULE_NOT_FOUND errors from build-info.json read", async () => {
    const { createRequire } = await import("node:module");
    const mockRequire = vi.fn().mockImplementation((id: string) => {
      if (id === "../../package.json") {
        const err = new Error(
          `Cannot find module '${id}'`,
        ) as NodeJS.ErrnoException;
        err.code = "MODULE_NOT_FOUND";
        throw err;
      }
      if (id === "../../build-info.json") {
        throw new Error("Disk error reading build-info.json");
      }
      return {};
    });
    vi.mocked(createRequire).mockReturnValue(
      mockRequire as unknown as NodeRequire,
    );

    expect(() => resolveMiladyVersion("file:///test")).toThrow(
      "Disk error reading build-info.json",
    );
  });
});
