import { describe, expect, it } from "vitest";
import { collectConfigEnvVars } from "./env-vars.js";
import type { MilaidyConfig } from "./types.js";

describe("collectConfigEnvVars", () => {
  it("should return empty object if config is undefined", () => {
    expect(collectConfigEnvVars(undefined)).toEqual({});
  });

  it("should return empty object if env config is missing", () => {
    expect(collectConfigEnvVars({} as MilaidyConfig)).toEqual({});
  });

  it("should return empty object if env config is empty", () => {
    expect(collectConfigEnvVars({ env: {} } as MilaidyConfig)).toEqual({});
  });

  it("should return vars from env.vars", () => {
    const config = {
      env: {
        vars: {
          KEY1: "value1",
          KEY2: "value2",
        },
      },
    } as unknown as MilaidyConfig;
    expect(collectConfigEnvVars(config)).toEqual({
      KEY1: "value1",
      KEY2: "value2",
    });
  });

  it("should return vars from env direct properties", () => {
    const config = {
      env: {
        KEY1: "value1",
        KEY2: "value2",
      },
    } as unknown as MilaidyConfig;
    expect(collectConfigEnvVars(config)).toEqual({
      KEY1: "value1",
      KEY2: "value2",
    });
  });

  it("should merge vars from env.vars and env direct properties", () => {
    const config = {
      env: {
        vars: {
          KEY1: "value1",
        },
        KEY2: "value2",
      },
    } as unknown as MilaidyConfig;
    expect(collectConfigEnvVars(config)).toEqual({
      KEY1: "value1",
      KEY2: "value2",
    });
  });

  it("should ignore shellEnv and vars keys in direct properties", () => {
    const config = {
      env: {
        shellEnv: "should be ignored",
        vars: {
          KEY1: "value1",
        },
        KEY2: "value2",
      },
    } as unknown as MilaidyConfig;
    // vars is handled separately, shellEnv is ignored
    expect(collectConfigEnvVars(config)).toEqual({
      KEY1: "value1",
      KEY2: "value2",
    });
  });

  it("should filter out non-string values", () => {
    const config = {
      env: {
        KEY1: 123,
        KEY2: "value2",
        KEY3: true,
      },
    } as unknown as MilaidyConfig;
    expect(collectConfigEnvVars(config)).toEqual({
      KEY2: "value2",
    });
  });

  it("should filter out empty string values", () => {
    const config = {
      env: {
        KEY1: "",
        KEY2: "   ",
        KEY3: "value3",
      },
    } as unknown as MilaidyConfig;
    expect(collectConfigEnvVars(config)).toEqual({
      KEY3: "value3",
    });
  });

  it("should filter out falsy values in env.vars", () => {
    const config = {
      env: {
        vars: {
          KEY1: "",
          KEY2: null,
          KEY3: "value3",
        },
      },
    } as unknown as MilaidyConfig;
    expect(collectConfigEnvVars(config)).toEqual({
      KEY3: "value3",
    });
  });
});
