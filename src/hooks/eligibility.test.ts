import { existsSync } from "node:fs";
import { platform } from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkEligibility } from "./eligibility";
import type { MilaidyHookMetadata } from "./types";

// Mock dependencies
vi.mock("node:os", () => ({
  platform: vi.fn(),
}));

vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
}));

// Mock path delimiter to be consistent
vi.mock("node:path", () => ({
  delimiter: ":",
}));

describe("checkEligibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock behaviors
    (platform as unknown as ReturnType<typeof vi.fn>).mockReturnValue("linux");
    (existsSync as unknown as ReturnType<typeof vi.fn>).mockReturnValue(false);
    vi.stubEnv("PATH", "/bin:/usr/bin");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("should be eligible if no metadata is provided", () => {
    const result = checkEligibility(undefined, undefined);
    expect(result.eligible).toBe(true);
    expect(result.missing).toEqual([]);
  });

  describe("OS Check", () => {
    it("should be eligible if OS matches", () => {
      (platform as unknown as ReturnType<typeof vi.fn>).mockReturnValue("darwin");
      const metadata: MilaidyHookMetadata = {
        events: [],
        os: ["darwin", "linux"],
      };

      const result = checkEligibility(metadata, undefined);
      expect(result.eligible).toBe(true);
      expect(result.missing).toEqual([]);
    });

    it("should be ineligible if OS does not match", () => {
      (platform as unknown as ReturnType<typeof vi.fn>).mockReturnValue("win32");
      const metadata: MilaidyHookMetadata = {
        events: [],
        os: ["darwin", "linux"],
      };

      const result = checkEligibility(metadata, undefined);
      expect(result.eligible).toBe(false);
      expect(result.missing).toHaveLength(1);
      expect(result.missing[0]).toContain("OS: requires darwin|linux");
    });

    it("should be eligible if os list is empty", () => {
      (platform as unknown as ReturnType<typeof vi.fn>).mockReturnValue("win32");
      const metadata: MilaidyHookMetadata = {
        events: [],
        os: [],
      };

      const result = checkEligibility(metadata, undefined);
      expect(result.eligible).toBe(true);
    });
  });

  describe("Always True", () => {
    it("should fail if OS check fails, even if always is true", () => {
      // Even if OS check fails? The implementation says check OS first.
      // Let's verify behavior. Based on code:
      // OS check adds to 'missing'.
      // Then if (metadata.always) returns { eligible: missing.length === 0, missing }
      // So 'always' acts as a "skip other checks", but not "ignore OS check failure".

      (platform as unknown as ReturnType<typeof vi.fn>).mockReturnValue("win32");
      const metadata: MilaidyHookMetadata = {
        events: [],
        os: ["linux"],
        always: true,
        requires: {
            bins: ["nonexistent"]
        }
      };

      const result = checkEligibility(metadata, undefined);
      // OS check runs first
      expect(result.eligible).toBe(false);
      expect(result.missing[0]).toContain("OS");
      // Binary check should be skipped because of 'always'
      expect(result.missing).not.toContain("Binary missing: nonexistent");
    });

    it("should skip binary checks if OS matches and always is true", () => {
      (platform as unknown as ReturnType<typeof vi.fn>).mockReturnValue("linux");
      const metadata: MilaidyHookMetadata = {
        events: [],
        os: ["linux"],
        always: true,
        requires: {
            bins: ["nonexistent"]
        }
      };

      const result = checkEligibility(metadata, undefined);
      expect(result.eligible).toBe(true);
      expect(result.missing).toEqual([]);
    });
  });

  describe("Binary Requirements", () => {
    beforeEach(() => {
        // Mock existsSync for specific paths
        (existsSync as unknown as ReturnType<typeof vi.fn>).mockImplementation((path: string) => {
            if (path === "/bin/curl" || path === "/usr/bin/curl") return true;
            if (path === "/bin/wget") return true;
            return false;
        });
    });

    it("should be eligible if all required binaries exist", () => {
      const metadata: MilaidyHookMetadata = {
        events: [],
        requires: {
          bins: ["curl", "wget"],
        },
      };

      const result = checkEligibility(metadata, undefined);
      expect(result.eligible).toBe(true);
    });

    it("should be ineligible if any required binary is missing", () => {
      const metadata: MilaidyHookMetadata = {
        events: [],
        requires: {
          bins: ["curl", "missing-bin"],
        },
      };

      const result = checkEligibility(metadata, undefined);
      expect(result.eligible).toBe(false);
      expect(result.missing).toContain("Binary missing: missing-bin");
    });

    it("should be eligible if at least one anyBins exists", () => {
      const metadata: MilaidyHookMetadata = {
        events: [],
        requires: {
          anyBins: ["missing-bin", "curl"],
        },
      };

      const result = checkEligibility(metadata, undefined);
      expect(result.eligible).toBe(true);
    });

    it("should be ineligible if no anyBins exist", () => {
      const metadata: MilaidyHookMetadata = {
        events: [],
        requires: {
          anyBins: ["missing-1", "missing-2"],
        },
      };

      const result = checkEligibility(metadata, undefined);
      expect(result.eligible).toBe(false);
      expect(result.missing[0]).toContain("None of: missing-1, missing-2");
    });
  });

  describe("Environment Requirements", () => {
    it("should be eligible if env var exists in process.env", () => {
      vi.stubEnv("MY_API_KEY", "12345");
      const metadata: MilaidyHookMetadata = {
        events: [],
        requires: {
          env: ["MY_API_KEY"],
        },
      };

      const result = checkEligibility(metadata, undefined);
      expect(result.eligible).toBe(true);
    });

    it("should be eligible if env var exists in hookConfig.env", () => {
      const metadata: MilaidyHookMetadata = {
        events: [],
        requires: {
          env: ["MY_API_KEY"],
        },
      };
      const hookConfig = {
        env: { MY_API_KEY: "secret" },
      };

      const result = checkEligibility(metadata, hookConfig);
      expect(result.eligible).toBe(true);
    });

    it("should be ineligible if env var is missing in both", () => {
      const metadata: MilaidyHookMetadata = {
        events: [],
        requires: {
          env: ["MISSING_KEY"],
        },
      };

      const result = checkEligibility(metadata, undefined);
      expect(result.eligible).toBe(false);
      expect(result.missing).toContain("Env missing: MISSING_KEY");
    });
  });

  describe("Config Requirements", () => {
    const milaidyConfig = {
      core: {
        enabled: true,
        feature: {
            flag: true,
            value: 10
        },
        empty: "",
        zero: 0,
        falseVal: false
      },
    };

    it("should be eligible if config path is truthy", () => {
      const metadata: MilaidyHookMetadata = {
        events: [],
        requires: {
          config: ["core.enabled", "core.feature.flag"],
        },
      };

      const result = checkEligibility(metadata, undefined, milaidyConfig);
      expect(result.eligible).toBe(true);
    });

    it("should be ineligible if config path is missing or falsy", () => {
        // isConfigPathTruthy checks for !== undefined, null, false, "", 0
      const metadata: MilaidyHookMetadata = {
        events: [],
        requires: {
          config: ["core.missing", "core.empty", "core.zero", "core.falseVal"],
        },
      };

      const result = checkEligibility(metadata, undefined, milaidyConfig);
      expect(result.eligible).toBe(false);
      expect(result.missing).toContain("Config missing: core.missing");
      expect(result.missing).toContain("Config missing: core.empty");
      expect(result.missing).toContain("Config missing: core.zero");
      expect(result.missing).toContain("Config missing: core.falseVal");
    });
  });
});
