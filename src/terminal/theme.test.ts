import { describe, expect, it, vi } from "vitest";
import { colorize } from "./theme.js";

describe("colorize", () => {
  it("applies color function when rich is true", () => {
    const colorFn = (val: string) => `colored(${val})`;
    const result = colorize(true, colorFn, "test");
    expect(result).toBe("colored(test)");
  });

  it("returns value as is when rich is false", () => {
    const colorFn = vi.fn();
    const result = colorize(false, colorFn as any, "test");
    expect(result).toBe("test");
    expect(colorFn).not.toHaveBeenCalled();
  });
});
