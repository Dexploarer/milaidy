import { describe, expect, it, vi } from "vitest";
import { colorize } from "./theme";

describe("colorize", () => {
  it("applies color function when rich is true", () => {
    const colorFn = vi.fn((val) => `colored(${val})`);
    const result = colorize(true, colorFn, "test");
    expect(result).toBe("colored(test)");
    expect(colorFn).toHaveBeenCalledWith("test");
  });

  it("returns value as is when rich is false", () => {
    const colorFn = vi.fn((val) => `colored(${val})`);
    const result = colorize(false, colorFn, "test");
    expect(result).toBe("test");
    expect(colorFn).not.toHaveBeenCalled();
  });
});
