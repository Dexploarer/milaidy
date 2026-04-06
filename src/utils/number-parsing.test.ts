import { describe, expect, it } from "vitest";
import {
  parseClampedFloat,
  parseClampedInteger,
  parsePositiveFloat,
  parsePositiveInteger,
} from "./number-parsing";

describe("number-parsing helpers", () => {
  it("parses positive integers with fallback", () => {
    expect(parsePositiveInteger("3", 1)).toBe(3);
    expect(parsePositiveInteger("12.8", 1)).toBe(12);
    expect(parsePositiveInteger("0019", 1)).toBe(19);
    expect(parsePositiveInteger("0", 4)).toBe(4);
    expect(parsePositiveInteger("-2", 4)).toBe(4);
    expect(parsePositiveInteger("nope", 4)).toBe(4);
    expect(parsePositiveInteger(null, 4)).toBe(4);
    expect(parsePositiveInteger("12abc", 4)).toBe(4);
  });

  it("handles undefined or invalid fallback for positive integer", () => {
    expect(parsePositiveInteger("nope")).toBeUndefined();
    expect(parsePositiveInteger("nope", NaN)).toBeUndefined();
    expect(parsePositiveInteger("nope", Infinity)).toBeUndefined();
    expect(parsePositiveInteger("", NaN)).toBeUndefined();
  });

  it("parses positive floats", () => {
    expect(parsePositiveFloat("0.5")).toBe(0.5);
    expect(parsePositiveFloat("1", { floor: true })).toBe(1);
    expect(parsePositiveFloat(" 2.25 ", { fallback: 0.1 })).toBe(2.25);
    expect(parsePositiveFloat("0", { fallback: 0.1 })).toBe(0.1);
    expect(parsePositiveFloat("bad", { fallback: 0.1 })).toBe(0.1);
  });

  it("handles no options for positive float", () => {
    expect(parsePositiveFloat("bad")).toBeUndefined();
    expect(parsePositiveFloat("")).toBeUndefined();
    expect(parsePositiveFloat("-1")).toBeUndefined();
  });

  it("parses and clamps floats", () => {
    expect(parseClampedFloat("0.5", { min: 0, max: 1, fallback: 0.2 })).toBe(
      0.5,
    );
    expect(parseClampedFloat("1.4", { min: 0, max: 1, fallback: 0.2 })).toBe(1);
    expect(parseClampedFloat("-0.2", { min: 0, max: 1, fallback: 0.2 })).toBe(
      0,
    );
    expect(parseClampedFloat("bad", { min: 0, max: 1, fallback: 0.2 })).toBe(
      0.2,
    );
  });

  it("handles no options for clamped float", () => {
    expect(parseClampedFloat("0.5")).toBe(0.5);
    expect(parseClampedFloat("bad")).toBeUndefined();
    expect(parseClampedFloat("")).toBeUndefined();
  });

  it("parses and clamps integers", () => {
    expect(parseClampedInteger("3", { min: 1, max: 5, fallback: 2 })).toBe(3);
    expect(parseClampedInteger("9", { min: 1, max: 5, fallback: 2 })).toBe(5);
    expect(parseClampedInteger("0", { min: 1, max: 5, fallback: 2 })).toBe(1);
    expect(parseClampedInteger("12.8", { min: 1, max: 20, fallback: 2 })).toBe(
      12,
    );
    expect(parseClampedInteger("bad", { min: 1, max: 5, fallback: 2 })).toBe(2);
    expect(parseClampedInteger(null, { min: 1, max: 5, fallback: 2 })).toBe(2);
  });

  it("handles no options for clamped integer", () => {
    expect(parseClampedInteger("3")).toBe(3);
    expect(parseClampedInteger("bad")).toBeUndefined();
    expect(parseClampedInteger("")).toBeUndefined();
  });

  it("handles one-sided clamp for integer", () => {
    expect(parseClampedInteger("10", { max: 5 })).toBe(5);
    expect(parseClampedInteger("-10", { min: -5 })).toBe(-5);
  });
});
