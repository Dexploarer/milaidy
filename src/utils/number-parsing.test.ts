import { describe, expect, it } from "vitest";
import {
  parseClampedFloat,
  parseClampedInteger,
  parsePositiveFloat,
  parsePositiveInteger,
} from "./number-parsing";

describe("number-parsing helpers", () => {
  describe("parsePositiveInteger", () => {
    it("parses valid positive integers", () => {
      expect(parsePositiveInteger("3", 1)).toBe(3);
      expect(parsePositiveInteger("0019", 1)).toBe(19);
    });

    it("floors floating point numbers", () => {
      expect(parsePositiveInteger("12.8", 1)).toBe(12);
      expect(parsePositiveInteger("12.1", 1)).toBe(12);
    });

    it("returns fallback for invalid inputs", () => {
      expect(parsePositiveInteger("0", 4)).toBe(4);
      expect(parsePositiveInteger("-2", 4)).toBe(4);
      expect(parsePositiveInteger("nope", 4)).toBe(4);
      expect(parsePositiveInteger(null, 4)).toBe(4);
      expect(parsePositiveInteger(undefined, 4)).toBe(4);
      expect(parsePositiveInteger("12abc", 4)).toBe(4);
      expect(parsePositiveInteger("", 4)).toBe(4);
      expect(parsePositiveInteger("   ", 4)).toBe(4);
    });

    it("handles missing fallback", () => {
      expect(parsePositiveInteger("abc")).toBeUndefined();
      expect(parsePositiveInteger("5")).toBe(5);
    });
  });

  describe("parsePositiveFloat", () => {
    it("parses valid positive floats", () => {
      expect(parsePositiveFloat("0.5")).toBe(0.5);
      expect(parsePositiveFloat(" 2.25 ", { fallback: 0.1 })).toBe(2.25);
    });

    it("applies floor option", () => {
      expect(parsePositiveFloat("1.8", { floor: true })).toBe(1);
    });

    it("returns fallback for invalid inputs", () => {
      expect(parsePositiveFloat("0", { fallback: 0.1 })).toBe(0.1);
      expect(parsePositiveFloat("-1.5", { fallback: 0.1 })).toBe(0.1);
      expect(parsePositiveFloat("bad", { fallback: 0.1 })).toBe(0.1);
      expect(parsePositiveFloat(null, { fallback: 0.1 })).toBe(0.1);
      expect(parsePositiveFloat(undefined, { fallback: 0.1 })).toBe(0.1);
      expect(parsePositiveFloat("", { fallback: 0.1 })).toBe(0.1);
    });

    it("handles missing fallback", () => {
      expect(parsePositiveFloat("abc")).toBeUndefined();
      expect(parsePositiveFloat("1.5")).toBe(1.5);
    });
  });

  describe("parseClampedFloat", () => {
    it("parses valid floats within range", () => {
      expect(parseClampedFloat("0.5", { min: 0, max: 1, fallback: 0.2 })).toBe(
        0.5,
      );
    });

    it("clamps values outside range", () => {
      expect(parseClampedFloat("1.4", { min: 0, max: 1, fallback: 0.2 })).toBe(
        1,
      );
      expect(parseClampedFloat("-0.2", { min: 0, max: 1, fallback: 0.2 })).toBe(
        0,
      );
    });

    it("returns fallback for invalid inputs", () => {
      expect(parseClampedFloat("bad", { min: 0, max: 1, fallback: 0.2 })).toBe(
        0.2,
      );
      expect(parseClampedFloat(null, { fallback: 0.2 })).toBe(0.2);
      expect(parseClampedFloat(undefined, { fallback: 0.2 })).toBe(0.2);
      expect(parseClampedFloat("", { fallback: 0.2 })).toBe(0.2);
    });

    it("handles missing min/max", () => {
      expect(parseClampedFloat("100", { fallback: 0.2 })).toBe(100);
      expect(parseClampedFloat("-100", { fallback: 0.2 })).toBe(-100);
      expect(parseClampedFloat("5", { min: 10, fallback: 0.2 })).toBe(10);
      expect(parseClampedFloat("15", { max: 10, fallback: 0.2 })).toBe(10);
    });

    it("handles missing options entirely", () => {
      expect(parseClampedFloat("abc")).toBeUndefined();
      expect(parseClampedFloat("5.5")).toBe(5.5);
    });
  });

  describe("parseClampedInteger", () => {
    it("parses valid integers within range", () => {
      expect(parseClampedInteger("3", { min: 1, max: 5, fallback: 2 })).toBe(3);
    });

    it("clamps values outside range", () => {
      expect(parseClampedInteger("9", { min: 1, max: 5, fallback: 2 })).toBe(5);
      expect(parseClampedInteger("0", { min: 1, max: 5, fallback: 2 })).toBe(1);
    });

    it("parses floats to integers correctly", () => {
      expect(
        parseClampedInteger("12.8", { min: 1, max: 20, fallback: 2 }),
      ).toBe(12);
    });

    it("returns fallback for invalid inputs", () => {
      expect(parseClampedInteger("bad", { min: 1, max: 5, fallback: 2 })).toBe(
        2,
      );
      expect(parseClampedInteger(null, { min: 1, max: 5, fallback: 2 })).toBe(
        2,
      );
      expect(
        parseClampedInteger(undefined, { min: 1, max: 5, fallback: 2 }),
      ).toBe(2);
      expect(parseClampedInteger("", { fallback: 2 })).toBe(2);
    });

    it("handles missing min/max", () => {
      expect(parseClampedInteger("100", { fallback: 2 })).toBe(100);
      expect(parseClampedInteger("-100", { fallback: 2 })).toBe(-100);
      expect(parseClampedInteger("5", { min: 10, fallback: 2 })).toBe(10);
      expect(parseClampedInteger("15", { max: 10, fallback: 2 })).toBe(10);
    });

    it("handles missing options entirely", () => {
      expect(parseClampedInteger("abc")).toBeUndefined();
      expect(parseClampedInteger("5")).toBe(5);
    });
  });
});
