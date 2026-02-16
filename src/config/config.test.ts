import fs from "node:fs";
import path from "node:path";
import JSON5 from "json5";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  configFileExists,
  loadMilaidyConfig,
  saveMilaidyConfig,
} from "./config.js";
import { collectConfigEnvVars } from "./env-vars.js";
import { resolveConfigIncludes } from "./includes.js";
import { resolveConfigPath } from "./paths.js";
import type { MilaidyConfig } from "./types.js";

// Mocks
vi.mock("node:fs", () => ({
  default: {
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
  },
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

vi.mock("json5", () => ({
  default: {
    parse: vi.fn(),
  },
}));

vi.mock("./paths.js", () => ({
  resolveConfigPath: vi.fn(),
}));

vi.mock("./includes.js", () => ({
  resolveConfigIncludes: vi.fn(),
}));

vi.mock("./env-vars.js", () => ({
  collectConfigEnvVars: vi.fn(),
}));

describe("config", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("loadMilaidyConfig", () => {
    it("should load and parse config when file exists", () => {
      const mockConfigPath = "/path/to/config.json5";
      const mockRawConfig = "{ env: { foo: 'bar' } }";
      const mockParsedConfig = { env: { foo: "bar" } };
      const mockResolvedConfig = { env: { foo: "bar" } };
      const mockEnvVars = { foo: "bar" };

      vi.mocked(resolveConfigPath).mockReturnValue(mockConfigPath);
      vi.mocked(fs.readFileSync).mockReturnValue(mockRawConfig);
      vi.mocked(JSON5.parse).mockReturnValue(mockParsedConfig);
      vi.mocked(resolveConfigIncludes).mockReturnValue(
        mockResolvedConfig as unknown as MilaidyConfig,
      );
      vi.mocked(collectConfigEnvVars).mockReturnValue(mockEnvVars);

      const result = loadMilaidyConfig();

      expect(resolveConfigPath).toHaveBeenCalled();
      expect(fs.readFileSync).toHaveBeenCalledWith(mockConfigPath, "utf-8");
      expect(JSON5.parse).toHaveBeenCalledWith(mockRawConfig);
      expect(resolveConfigIncludes).toHaveBeenCalledWith(
        mockParsedConfig,
        mockConfigPath,
      );
      expect(collectConfigEnvVars).toHaveBeenCalledWith(mockResolvedConfig);
      expect(process.env.foo).toBe("bar");
      expect(result).toEqual(mockResolvedConfig);
    });

    it("should not overwrite existing env vars", () => {
      process.env.foo = "existing";
      const mockEnvVars = { foo: "new" };

      vi.mocked(resolveConfigPath).mockReturnValue("/path/to/config.json5");
      vi.mocked(fs.readFileSync).mockReturnValue("{}");
      vi.mocked(JSON5.parse).mockReturnValue({});
      vi.mocked(resolveConfigIncludes).mockReturnValue({});
      vi.mocked(collectConfigEnvVars).mockReturnValue(mockEnvVars);

      loadMilaidyConfig();

      expect(process.env.foo).toBe("existing");
    });

    it("should return empty object if config file does not exist (ENOENT)", () => {
      const error = new Error("ENOENT") as NodeJS.ErrnoException;
      error.code = "ENOENT";
      vi.mocked(resolveConfigPath).mockReturnValue("/path/to/config.json5");
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw error;
      });

      const result = loadMilaidyConfig();

      expect(result).toEqual({});
    });

    it("should throw error if read fails with other error", () => {
      const error = new Error("Other error");
      vi.mocked(resolveConfigPath).mockReturnValue("/path/to/config.json5");
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw error;
      });

      expect(() => loadMilaidyConfig()).toThrow("Other error");
    });
  });

  describe("saveMilaidyConfig", () => {
    it("should save config to file", () => {
      const mockConfigPath = "/path/to/config.json5";
      const mockConfig = { env: { foo: "bar" } };

      vi.mocked(resolveConfigPath).mockReturnValue(mockConfigPath);
      vi.mocked(fs.existsSync).mockReturnValue(true); // Dir exists

      saveMilaidyConfig(mockConfig as unknown as MilaidyConfig);

      expect(resolveConfigPath).toHaveBeenCalled();
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        mockConfigPath,
        expect.stringContaining('"foo": "bar"'),
        { encoding: "utf-8", mode: 0o600 },
      );
    });

    it("should create directory if it does not exist", () => {
      const mockConfigPath = "/path/to/config.json5";
      const mockDir = "/path/to";

      vi.mocked(resolveConfigPath).mockReturnValue(mockConfigPath);
      // fs.existsSync is called for dir.
      vi.mocked(fs.existsSync).mockReturnValue(false);

      saveMilaidyConfig({} as MilaidyConfig);

      expect(fs.mkdirSync).toHaveBeenCalledWith(mockDir, {
        recursive: true,
        mode: 0o700,
      });
    });
  });

  describe("configFileExists", () => {
    it("should return true if config file exists", () => {
      vi.mocked(resolveConfigPath).mockReturnValue("/path/to/config.json5");
      vi.mocked(fs.existsSync).mockReturnValue(true);

      expect(configFileExists()).toBe(true);
      expect(resolveConfigPath).toHaveBeenCalled();
      expect(fs.existsSync).toHaveBeenCalledWith("/path/to/config.json5");
    });

    it("should return false if config file does not exist", () => {
      vi.mocked(resolveConfigPath).mockReturnValue("/path/to/config.json5");
      vi.mocked(fs.existsSync).mockReturnValue(false);

      expect(configFileExists()).toBe(false);
    });
  });
});
