import { describe, expect, it } from "vitest";
import { isPlainObject } from "../object-utils";

describe("object-utils", () => {
  describe("isPlainObject", () => {
    it("returns true for plain objects", () => {
      expect(isPlainObject({})).toBe(true);
      expect(isPlainObject({ a: 1 })).toBe(true);
      expect(isPlainObject(Object.create(Object.prototype))).toBe(true);
    });

    it("returns true for objects with a null prototype", () => {
      expect(isPlainObject(Object.create(null))).toBe(true);
    });

    it("returns false for arrays", () => {
      expect(isPlainObject([])).toBe(false);
      expect(isPlainObject([1, 2, 3])).toBe(false);
    });

    it("returns false for null", () => {
      expect(isPlainObject(null)).toBe(false);
    });

    it("returns false for undefined", () => {
      expect(isPlainObject(undefined)).toBe(false);
    });

    it("returns false for primitives", () => {
      expect(isPlainObject(123)).toBe(false);
      expect(isPlainObject("abc")).toBe(false);
      expect(isPlainObject(true)).toBe(false);
      expect(isPlainObject(Symbol("sym"))).toBe(false);
    });

    it("returns false for functions", () => {
      expect(isPlainObject(() => {})).toBe(false);
      expect(isPlainObject(() => {})).toBe(false);
      class TestClass {}
      expect(isPlainObject(TestClass)).toBe(false);
    });

    it("returns false for instances of classes", () => {
      class TestClass {
        constructor(public a: number) {}
      }
      expect(isPlainObject(new TestClass(1))).toBe(false);
    });

    it("returns false for Built-ins", () => {
      expect(isPlainObject(new Date())).toBe(false);
      expect(isPlainObject(/test/)).toBe(false);
      expect(isPlainObject(new Map())).toBe(false);
      expect(isPlainObject(new Set())).toBe(false);
      expect(isPlainObject(new WeakMap())).toBe(false);
      expect(isPlainObject(new WeakSet())).toBe(false);
      expect(isPlainObject(Promise.resolve())).toBe(false);
    });
  });
});
