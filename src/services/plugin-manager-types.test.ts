import { describe, expect, it } from "vitest";
import { isCoreManagerLike, isPluginManagerLike } from "./plugin-manager-types";

describe("plugin-manager-types", () => {
  describe("isPluginManagerLike", () => {
    it("should return false for null", () => {
      expect(isPluginManagerLike(null)).toBe(false);
    });

    it("should return false for undefined", () => {
      expect(isPluginManagerLike(undefined)).toBe(false);
    });

    it("should return false for primitive types", () => {
      expect(isPluginManagerLike(123)).toBe(false);
      expect(isPluginManagerLike("string")).toBe(false);
      expect(isPluginManagerLike(true)).toBe(false);
    });

    it("should return false for empty object", () => {
      expect(isPluginManagerLike({})).toBe(false);
    });

    it("should return false for partial match", () => {
      expect(
        isPluginManagerLike({
          refreshRegistry: () => {},
          listInstalledPlugins: () => {},
        }),
      ).toBe(false);
    });

    it("should return true for valid match", () => {
      expect(
        isPluginManagerLike({
          refreshRegistry: () => {},
          listInstalledPlugins: () => {},
          getRegistryPlugin: () => {},
          searchRegistry: () => {},
          installPlugin: () => {},
          uninstallPlugin: () => {},
          listEjectedPlugins: () => {},
          ejectPlugin: () => {},
          syncPlugin: () => {},
          reinjectPlugin: () => {},
        }),
      ).toBe(true);
    });
  });

  describe("isCoreManagerLike", () => {
    it("should return false for null", () => {
      expect(isCoreManagerLike(null)).toBe(false);
    });

    it("should return false for undefined", () => {
      expect(isCoreManagerLike(undefined)).toBe(false);
    });

    it("should return false for primitive types", () => {
      expect(isCoreManagerLike(123)).toBe(false);
      expect(isCoreManagerLike("string")).toBe(false);
      expect(isCoreManagerLike(true)).toBe(false);
    });

    it("should return false for empty object", () => {
      expect(isCoreManagerLike({})).toBe(false);
    });

    it("should return true for valid match", () => {
      expect(
        isCoreManagerLike({
          getCoreStatus: () => {},
        }),
      ).toBe(true);
    });
  });
});
