import { describe, expect, it } from "vitest";
import { isPlainObject } from "./object-utils";

class CustomClass {}

describe("isPlainObject", () => {
  it("should return true for plain objects", () => {
    expect(isPlainObject({})).toBe(true);
    expect(isPlainObject({ key: "value" })).toBe(true);
    expect(isPlainObject(Object.create(null))).toBe(true);
  });

  it("should return false for arrays", () => {
    expect(isPlainObject([])).toBe(false);
    expect(isPlainObject([1, 2, 3])).toBe(false);
  });

  it("should return false for null", () => {
    expect(isPlainObject(null)).toBe(false);
  });

  it("should return false for undefined", () => {
    expect(isPlainObject(undefined)).toBe(false);
  });

  it("should return false for strings", () => {
    expect(isPlainObject("")).toBe(false);
    expect(isPlainObject("test")).toBe(false);
  });

  it("should return false for numbers", () => {
    expect(isPlainObject(0)).toBe(false);
    expect(isPlainObject(123)).toBe(false);
  });

  it("should return false for booleans", () => {
    expect(isPlainObject(true)).toBe(false);
    expect(isPlainObject(false)).toBe(false);
  });

  it("should return false for Date instances", () => {
    expect(isPlainObject(new Date())).toBe(false);
  });

  it("should return false for Map and Set instances", () => {
    expect(isPlainObject(new Map())).toBe(false);
    expect(isPlainObject(new Set())).toBe(false);
  });

  it("should return true for custom class instances (due to object-utils implementation of Object.prototype.toString.call)", () => {
    // The current implementation uses Object.prototype.toString.call(value) === "[object Object]",
    // which returns true for generic class instances that don't have a specific Symbol.toStringTag.
    expect(isPlainObject(new CustomClass())).toBe(true);
  });

  it("should return false for functions", () => {
    expect(isPlainObject(() => {})).toBe(false);
    expect(isPlainObject(function test() {})).toBe(false);
  });
});
