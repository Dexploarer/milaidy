import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { resolveMiladyVersion } from "./version-resolver";

// We can mock the module instead of trying to spy on a property
vi.mock("node:module", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:module")>();
  return {
    ...actual,
    createRequire: vi.fn(),
  };
});
import * as nodeModule from "node:module";

describe("resolveMiladyVersion", () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = process.env;
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.clearAllMocks();
  });

  it("should return MILADY_BUNDLED_VERSION if set", () => {
    process.env.MILADY_BUNDLED_VERSION = "2.0.0-env";
    expect(resolveMiladyVersion(import.meta.url)).toBe("2.0.0-env");
  });

  it("should read from package.json if env vars are not set", () => {
    delete process.env.MILADY_BUNDLED_VERSION;
    const mockRequire = vi.fn().mockImplementation((path) => {
      if (path === "../../package.json") {
        return { version: "3.0.0-pkg" };
      }
      const err = new Error("Not found");
      (err as any).code = "MODULE_NOT_FOUND";
      throw err;
    });
    vi.mocked(nodeModule.createRequire).mockReturnValue(mockRequire as any);

    expect(resolveMiladyVersion(import.meta.url)).toBe("3.0.0-pkg");
    expect(mockRequire).toHaveBeenCalledWith("../../package.json");
  });

  it("should read from build-info.json if package.json does not exist", () => {
    delete process.env.MILADY_BUNDLED_VERSION;
    const mockRequire = vi.fn().mockImplementation((path) => {
      if (path === "../../package.json") {
        const err = new Error("Not found");
        (err as any).code = "MODULE_NOT_FOUND";
        throw err;
      }
      if (path === "../../build-info.json") {
        return { version: "4.0.0-build" };
      }
      const err = new Error("Not found");
      (err as any).code = "MODULE_NOT_FOUND";
      throw err;
    });
    vi.mocked(nodeModule.createRequire).mockReturnValue(mockRequire as any);

    expect(resolveMiladyVersion(import.meta.url)).toBe("4.0.0-build");
  });

  it("should try fallback paths for build-info.json", () => {
    delete process.env.MILADY_BUNDLED_VERSION;
    const mockRequire = vi.fn().mockImplementation((path) => {
      if (path === "../../package.json" || path === "../../build-info.json" || path === "../build-info.json") {
        const err = new Error("Not found");
        (err as any).code = "MODULE_NOT_FOUND";
        throw err;
      }
      if (path === "./build-info.json") {
        return { version: "5.0.0-build2" };
      }
      const err = new Error("Not found");
      (err as any).code = "MODULE_NOT_FOUND";
      throw err;
    });
    vi.mocked(nodeModule.createRequire).mockReturnValue(mockRequire as any);

    expect(resolveMiladyVersion(import.meta.url)).toBe("5.0.0-build2");
  });

  it("should throw non-MODULE_NOT_FOUND errors from package.json", () => {
    delete process.env.MILADY_BUNDLED_VERSION;
    const mockRequire = vi.fn().mockImplementation((path) => {
      if (path === "../../package.json") {
        throw new Error("Some syntax error");
      }
      const err = new Error("Not found");
      (err as any).code = "MODULE_NOT_FOUND";
      throw err;
    });
    vi.mocked(nodeModule.createRequire).mockReturnValue(mockRequire as any);

    expect(() => resolveMiladyVersion(import.meta.url)).toThrow("Some syntax error");
  });

  it("should throw non-MODULE_NOT_FOUND errors from build-info.json", () => {
    delete process.env.MILADY_BUNDLED_VERSION;
    const mockRequire = vi.fn().mockImplementation((path) => {
      if (path === "../../package.json") {
        const err = new Error("Not found");
        (err as any).code = "MODULE_NOT_FOUND";
        throw err;
      }
      if (path === "../../build-info.json") {
        throw new Error("Syntax error in build-info");
      }
      const err = new Error("Not found");
      (err as any).code = "MODULE_NOT_FOUND";
      throw err;
    });
    vi.mocked(nodeModule.createRequire).mockReturnValue(mockRequire as any);

    expect(() => resolveMiladyVersion(import.meta.url)).toThrow("Syntax error in build-info");
  });

  it("should return 0.0.0 as fallback if no version found", () => {
    delete process.env.MILADY_BUNDLED_VERSION;
    const mockRequire = vi.fn().mockImplementation(() => {
      const err = new Error("Not found");
      (err as any).code = "MODULE_NOT_FOUND";
      throw err;
    });
    vi.mocked(nodeModule.createRequire).mockReturnValue(mockRequire as any);

    expect(resolveMiladyVersion(import.meta.url)).toBe("0.0.0");
  });
});
