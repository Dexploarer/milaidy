import type { TUI } from "@mariozechner/pi-tui";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToolExecutionComponent } from "./tool-execution.js";

const mockSetBgFn = vi.fn();
const mockClear = vi.fn();
const mockAddChild = vi.fn();
const mockRender = vi.fn().mockReturnValue(["rendered box"]);
const mockInvalidateBox = vi.fn();

const mockStopLoader = vi.fn();
const mockInvalidateLoader = vi.fn();

vi.mock("@mariozechner/pi-tui", () => {
  return {
    Box: class {
      setBgFn = mockSetBgFn;
      clear = mockClear;
      addChild = mockAddChild;
      render = mockRender;
      invalidate = mockInvalidateBox;
    },
    Loader: class {
      stop = mockStopLoader;
      invalidate = mockInvalidateLoader;
      // biome-ignore lint/suspicious/noExplicitAny: Mocking external constructor
      constructor(_tui: any, color1: any, color2: any) {
        // Exercise the callbacks to get coverage
        color1("spinner text");
        color2("muted text");
      }
    },
    Text: class {
      constructor(
        public text: string,
        public x: number,
        public y: number,
      ) {}
    },
    TUI: class {},
  };
});

describe("ToolExecutionComponent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should initialize with 'running' status and loader", () => {
    const mockTui = {} as unknown as TUI;
    const component = new ToolExecutionComponent(
      "testAction",
      { arg1: "value" },
      mockTui,
    );

    expect(component).toBeDefined();

    // Test the callbacks passed to Box
    const setBgFnCall = mockSetBgFn.mock.calls;
    // To trigger the background callback:
    if (setBgFnCall.length > 0 && typeof setBgFnCall[0][0] === "function") {
      setBgFnCall[0][0]("bgtext");
    }

    const lines = component.render(100);
    expect(lines).toEqual(["rendered box"]);
    expect(mockRender).toHaveBeenCalledWith(100);
    expect(mockClear).toHaveBeenCalled();
    expect(mockAddChild).toHaveBeenCalled(); // Header and Loader
  });

  it("should update result to success", () => {
    const mockTui = {} as unknown as TUI;
    const component = new ToolExecutionComponent(
      "testAction",
      { arg1: "value" },
      mockTui,
    );

    component.updateResult({ text: "Success result" });

    expect(mockStopLoader).toHaveBeenCalled();
    expect(mockSetBgFn).toHaveBeenCalled();

    // Trigger the success bg callback
    const setBgFnCall = mockSetBgFn.mock.calls;
    const lastCall = setBgFnCall[setBgFnCall.length - 1];
    if (lastCall && typeof lastCall[0] === "function") {
      lastCall[0]("successbg");
    }

    // After clear, it should add header, and text body.
    expect(mockClear).toHaveBeenCalledTimes(2);
  });

  it("should update result to error", () => {
    const mockTui = {} as unknown as TUI;
    const component = new ToolExecutionComponent(
      "testAction",
      { arg1: "value" },
      mockTui,
    );

    component.updateResult({ text: "Error result", isError: true });

    expect(mockStopLoader).toHaveBeenCalled();
    expect(mockSetBgFn).toHaveBeenCalled();

    // Trigger the error bg callback
    const setBgFnCall = mockSetBgFn.mock.calls;
    const lastCall = setBgFnCall[setBgFnCall.length - 1];
    if (lastCall && typeof lastCall[0] === "function") {
      lastCall[0]("errorbg");
    }
  });

  it("should handle updateResult with missing text", () => {
    const mockTui = {} as unknown as TUI;
    const component = new ToolExecutionComponent("testAction", {}, mockTui);
    component.updateResult({});
    expect(mockClear).toHaveBeenCalledTimes(2);
  });

  it("should summarize large arguments", () => {
    const mockTui = {} as unknown as TUI;
    const largeString = "a".repeat(100);
    const _component = new ToolExecutionComponent(
      "testAction",
      { arg1: largeString },
      mockTui,
    );

    expect(mockAddChild).toHaveBeenCalled();
    const calls = mockAddChild.mock.calls;
    // Check header text creation arg: it should contain truncated text
    const headerCall = calls.find((call) =>
      call[0].text?.includes("arg1=aaaaaaaaaaaaaaaaaaaaaaaaaaa..."),
    );
    expect(headerCall).toBeDefined();
  });

  it("should handle non-string arguments in summary", () => {
    const mockTui = {} as unknown as TUI;
    const _component = new ToolExecutionComponent(
      "testAction",
      { arg1: 123, arg2: { nested: true } },
      mockTui,
    );

    const calls = mockAddChild.mock.calls;
    const headerCall = calls.find((call) => call[0].text?.includes("arg1=123"));
    expect(headerCall).toBeDefined();
  });

  it("should handle empty arguments", () => {
    const mockTui = {} as unknown as TUI;
    const _component = new ToolExecutionComponent("testAction", {}, mockTui);
    const calls = mockAddChild.mock.calls;
    const headerCall = calls.find((call) =>
      call[0].text?.includes("testAction"),
    );
    expect(headerCall).toBeDefined();
  });

  it("should truncate multiple summary args when total length exceeds 80", () => {
    const mockTui = {} as unknown as TUI;
    const _component = new ToolExecutionComponent(
      "testAction",
      { a: "A".repeat(30), b: "B".repeat(30), c: "C".repeat(30) },
      mockTui,
    );

    const calls = mockAddChild.mock.calls;
    const headerCall = calls.find((call) => call[0].text?.includes("..."));
    expect(headerCall).toBeDefined();
  });

  it("should toggle expanded state", () => {
    const mockTui = {} as unknown as TUI;
    const component = new ToolExecutionComponent("testAction", {}, mockTui);

    component.updateResult({ text: "1\n2\n3\n4\n5\n6\n7" });

    mockAddChild.mockClear();
    component.setExpanded(true);

    // After expanding, the last child added shouldn't be the "... more lines" message
    const calls = mockAddChild.mock.calls;
    const textAdded = calls.map((c) => c[0].text).join(" ");
    expect(textAdded).not.toContain("more lines");
    expect(textAdded).toContain("7"); // Should contain the 7th line
  });

  it("should handle multiline output when short", () => {
    const mockTui = {} as unknown as TUI;
    const component = new ToolExecutionComponent("testAction", {}, mockTui);

    mockAddChild.mockClear();
    component.updateResult({ text: "Line 1\nLine 2\nLine 3" });

    const calls = mockAddChild.mock.calls;
    const textAdded = calls.map((c) => c[0].text).join(" ");
    expect(textAdded).not.toContain("more lines");
  });

  it("should truncate multiline output when long and not expanded", () => {
    const mockTui = {} as unknown as TUI;
    const component = new ToolExecutionComponent("testAction", {}, mockTui);

    mockAddChild.mockClear();
    component.updateResult({ text: "1\n2\n3\n4\n5\n6\n7" });

    const calls = mockAddChild.mock.calls;
    const textAdded = calls.map((c) => c[0].text).join(" ");
    expect(textAdded).toContain("more lines");
    expect(textAdded).not.toContain("7");
  });

  it("should correctly handle invalidate", () => {
    const mockTui = {} as unknown as TUI;
    const component = new ToolExecutionComponent("testAction", {}, mockTui);

    component.invalidate();
    expect(mockInvalidateBox).toHaveBeenCalled();
    expect(mockInvalidateLoader).toHaveBeenCalled();
  });

  it("should safely handle invalidate without loader", () => {
    const mockTui = {} as unknown as TUI;
    const component = new ToolExecutionComponent("testAction", {}, mockTui);
    component.updateResult({ text: "Success" }); // sets loader to null

    mockInvalidateBox.mockClear();
    mockInvalidateLoader.mockClear();

    component.invalidate();
    expect(mockInvalidateBox).toHaveBeenCalled();
    expect(mockInvalidateLoader).not.toHaveBeenCalled();
  });
});
