import { describe, it, expect } from "vitest";
import { isPluginManagerLike, isCoreManagerLike } from "./plugin-manager-types.js";

describe("plugin-manager-types", () => {
    describe("isPluginManagerLike", () => {
        it("should return true for a valid PluginManagerLike object", () => {
            const validManager = {
                refreshRegistry: async () => new Map(),
                listInstalledPlugins: async () => [],
                getRegistryPlugin: async () => null,
                searchRegistry: async () => [],
                installPlugin: async () => ({}),
                uninstallPlugin: async () => ({}),
                listEjectedPlugins: async () => [],
                ejectPlugin: async () => ({}),
                syncPlugin: async () => ({}),
                reinjectPlugin: async () => ({})
            };

            expect(isPluginManagerLike(validManager)).toBe(true);
        });

        it("should return false for an object missing methods", () => {
            const invalidManager = {
                refreshRegistry: async () => new Map(),
                listInstalledPlugins: async () => []
            };

            expect(isPluginManagerLike(invalidManager)).toBe(false);
        });

        it("should return false for null or undefined", () => {
            expect(isPluginManagerLike(null)).toBe(false);
            expect(isPluginManagerLike(undefined)).toBe(false);
        });

        it("should return false for non-objects", () => {
            expect(isPluginManagerLike("string")).toBe(false);
            expect(isPluginManagerLike(123)).toBe(false);
        });
    });

    describe("isCoreManagerLike", () => {
        it("should return true for a valid CoreManagerLike object", () => {
            const validManager = {
                getCoreStatus: async () => ({})
            };

            expect(isCoreManagerLike(validManager)).toBe(true);
        });

        it("should return false for an object missing methods", () => {
            const invalidManager = {
                somethingElse: async () => ({})
            };

            expect(isCoreManagerLike(invalidManager)).toBe(false);
        });

        it("should return false for null or undefined", () => {
            expect(isCoreManagerLike(null)).toBe(false);
            expect(isCoreManagerLike(undefined)).toBe(false);
        });

        it("should return false for non-objects", () => {
            expect(isCoreManagerLike("string")).toBe(false);
            expect(isCoreManagerLike(123)).toBe(false);
        });
    });
});
