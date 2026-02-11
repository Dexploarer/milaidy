import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Use vi.hoisted to share the mock function between the test file and the mock factory
const { mockRequire } = vi.hoisted(() => {
  return { mockRequire: vi.fn() };
});

// Mock node:module createRequire
vi.mock("node:module", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:module")>();
  return {
    ...actual,
    createRequire: () => mockRequire,
  };
});

describe("VERSION", () => {
  beforeEach(() => {
    vi.resetModules();
    mockRequire.mockReset();
    // Default behavior: throw MODULE_NOT_FOUND for everything
    mockRequire.mockImplementation(() => {
      const err = new Error("Cannot find module");
      (err as any).code = "MODULE_NOT_FOUND";
      throw err;
    });

    delete process.env.MILAIDY_BUNDLED_VERSION;
    // @ts-ignore
    delete globalThis.__MILAIDY_VERSION__;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("uses __MILAIDY_VERSION__ global if present", async () => {
    // @ts-ignore
    globalThis.__MILAIDY_VERSION__ = "1.0.0-global";
    const { VERSION } = await import("./version.ts");
    expect(VERSION).toBe("1.0.0-global");
  });

  it("uses process.env.MILAIDY_BUNDLED_VERSION if global is missing", async () => {
    process.env.MILAIDY_BUNDLED_VERSION = "1.0.0-env";
    const { VERSION } = await import("./version.ts");
    expect(VERSION).toBe("1.0.0-env");
  });

  it("reads from package.json if env vars are missing", async () => {
    mockRequire.mockImplementation((path: string) => {
      if (path === "../../package.json") {
        return { version: "1.0.0-pkg" };
      }
      const err = new Error("Cannot find module");
      (err as any).code = "MODULE_NOT_FOUND";
      throw err;
    });

    const { VERSION } = await import("./version.ts");
    expect(VERSION).toBe("1.0.0-pkg");
  });

  it("reads from build-info.json (../../) if package.json is missing", async () => {
    mockRequire.mockImplementation((path: string) => {
      if (path === "../../build-info.json") {
        return { version: "1.0.0-build-1" };
      }
      const err = new Error("Cannot find module");
      (err as any).code = "MODULE_NOT_FOUND";
      throw err;
    });

    const { VERSION } = await import("./version.ts");
    expect(VERSION).toBe("1.0.0-build-1");
  });

  it("reads from build-info.json (../) if others are missing", async () => {
    mockRequire.mockImplementation((path: string) => {
      if (path === "../build-info.json") {
        return { version: "1.0.0-build-2" };
      }
      const err = new Error("Cannot find module");
      (err as any).code = "MODULE_NOT_FOUND";
      throw err;
    });

    const { VERSION } = await import("./version.ts");
    expect(VERSION).toBe("1.0.0-build-2");
  });

  it("reads from build-info.json (./) if others are missing", async () => {
    mockRequire.mockImplementation((path: string) => {
      if (path === "./build-info.json") {
        return { version: "1.0.0-build-3" };
      }
      const err = new Error("Cannot find module");
      (err as any).code = "MODULE_NOT_FOUND";
      throw err;
    });

    const { VERSION } = await import("./version.ts");
    expect(VERSION).toBe("1.0.0-build-3");
  });

  it("falls back to 0.0.0 if nothing is found", async () => {
    const { VERSION } = await import("./version.ts");
    expect(VERSION).toBe("0.0.0");
  });

  it("ignores MODULE_NOT_FOUND errors but rethrows others", async () => {
    mockRequire.mockImplementation(() => {
      throw new Error("Some other error");
    });

    await expect(import("./version.ts")).rejects.toThrow("Some other error");
  });

  it("skips build-info.json candidates that do not have version property", async () => {
     mockRequire.mockImplementation((path: string) => {
      if (path === "../../build-info.json") {
        return {}; // No version
      }
      if (path === "../build-info.json") {
        return { version: "1.0.0-correct" };
      }
      const err = new Error("Cannot find module");
      (err as any).code = "MODULE_NOT_FOUND";
      throw err;
    });

    const { VERSION } = await import("./version.ts");
    expect(VERSION).toBe("1.0.0-correct");
  });
});
