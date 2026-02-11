import { describe, expect, it } from "vitest";
import { collectConfigEnvVars } from "./env-vars.js";
import type { MilaidyConfig } from "./types.js";

describe("collectConfigEnvVars", () => {
  it("returns empty object for undefined config", () => {
    expect(collectConfigEnvVars(undefined)).toEqual({});
  });

  it("returns empty object for empty config", () => {
    expect(collectConfigEnvVars({})).toEqual({});
  });

  it("returns empty object for config with undefined env", () => {
    expect(collectConfigEnvVars({ env: undefined })).toEqual({});
  });

  it("collects variables from env.vars", () => {
    const config: MilaidyConfig = {
      env: {
        vars: {
          KEY1: "value1",
          KEY2: "value2",
        },
      },
    };
    expect(collectConfigEnvVars(config)).toEqual({
      KEY1: "value1",
      KEY2: "value2",
    });
  });

  it("skips falsy values in env.vars", () => {
    // env.vars values are typed as string, but we can test runtime behavior
    // assuming some dynamic configuration or type bypass
    const config = {
      env: {
        vars: {
          KEY1: "value1",
          KEY2: "", // empty string is falsy
        },
      },
    } as unknown as MilaidyConfig;

    expect(collectConfigEnvVars(config)).toEqual({
      KEY1: "value1",
    });
  });

  it("collects variables from direct env properties", () => {
    const config: MilaidyConfig = {
      env: {
        KEY3: "value3",
        KEY4: "value4",
      },
    };
    expect(collectConfigEnvVars(config)).toEqual({
      KEY3: "value3",
      KEY4: "value4",
    });
  });

  it("skips non-string values in direct env properties", () => {
    const config = {
      env: {
        KEY1: "value1",
        KEY2: 123, // non-string
        KEY3: true, // non-string
        KEY4: null, // non-string
      },
    } as unknown as MilaidyConfig;

    expect(collectConfigEnvVars(config)).toEqual({
      KEY1: "value1",
    });
  });

  it("skips empty or whitespace-only strings in direct env properties", () => {
    const config: MilaidyConfig = {
      env: {
        KEY1: "value1",
        KEY2: "",
        KEY3: "   ",
      },
    };
    expect(collectConfigEnvVars(config)).toEqual({
      KEY1: "value1",
    });
  });

  it("skips reserved keys 'shellEnv' and 'vars' in direct env properties", () => {
    const config: MilaidyConfig = {
      env: {
        KEY1: "value1",
        shellEnv: { enabled: true },
        vars: { KEY2: "value2" },
      },
    };
    // vars are processed separately, but the key 'vars' itself should not appear
    // shellEnv should be skipped entirely
    expect(collectConfigEnvVars(config)).toEqual({
      KEY1: "value1",
      KEY2: "value2",
    });
  });

  it("prioritizes direct env properties over env.vars", () => {
    const config: MilaidyConfig = {
      env: {
        vars: {
          COMMON: "from_vars",
          UNIQUE_VARS: "vars_only",
        },
        COMMON: "from_direct",
        UNIQUE_DIRECT: "direct_only",
      },
    };
    expect(collectConfigEnvVars(config)).toEqual({
      COMMON: "from_direct",
      UNIQUE_VARS: "vars_only",
      UNIQUE_DIRECT: "direct_only",
    });
  });

  it("handles mixed valid and invalid inputs gracefully", () => {
    const config = {
      env: {
        vars: {
          VALID_VAR: "valid",
          EMPTY_VAR: "",
        },
        DIRECT_VALID: "direct",
        DIRECT_EMPTY: "   ",
        DIRECT_NUMBER: 42,
        shellEnv: {},
      },
    } as unknown as MilaidyConfig;

    expect(collectConfigEnvVars(config)).toEqual({
      VALID_VAR: "valid",
      DIRECT_VALID: "direct",
    });
  });
});
