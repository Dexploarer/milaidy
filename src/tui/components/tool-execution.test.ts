import { describe, expect, it, vi, beforeEach } from "vitest";
import { ToolExecutionComponent } from "./tool-execution.js";

// Mock tuiTheme first so we can verify color fns
vi.mock("../theme.js", () => {
  return {
    tuiTheme: {
      warning: vi.fn((s) => `warning:${s}`),
      muted: vi.fn((s) => `muted:${s}`),
      toolPendingBg: vi.fn((s) => `toolPendingBg:${s}`),
      toolSuccessBg: vi.fn((s) => `toolSuccessBg:${s}`),
      toolErrorBg: vi.fn((s) => `toolErrorBg:${s}`),
      bold: vi.fn((s) => `bold:${s}`),
      error: vi.fn((s) => `error:${s}`),
      dim: vi.fn((s) => `dim:${s}`),
    }
  };
});

// We'll capture added children to verify logic
let boxChildren: any[] = [];
let boxBgFn: Function | null = null;
let loaderInstance: any = null;

vi.mock("@mariozechner/pi-tui", () => {
  return {
    TUI: class TUI {},
    Box: class Box {
      constructor() {
        boxChildren = [];
        boxBgFn = null;
      }
      addChild = vi.fn((child) => { boxChildren.push(child); });
      clear = vi.fn(() => { boxChildren = []; });
      setBgFn = vi.fn((fn) => { boxBgFn = fn; });
      render = vi.fn().mockReturnValue(["rendered box"]);
      invalidate = vi.fn();
    },
    Text: class Text {
      constructor(public text: string, public x: number, public y: number) {}
    },
    Loader: class Loader {
      constructor() {
        loaderInstance = this;
      }
      stop = vi.fn();
      invalidate = vi.fn();
    },
  };
});

describe("ToolExecutionComponent", () => {
  let tui: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    boxChildren = [];
    boxBgFn = null;
    loaderInstance = null;
    const { TUI } = await import("@mariozechner/pi-tui");
    tui = new TUI();
  });

  it("initializes in running state with loader and pending bg", () => {
    const args = { arg1: "value1" };
    const component = new ToolExecutionComponent("testTool", args, tui);

    expect(component).toBeDefined();

    // Header text with arg summary
    expect(boxChildren.length).toBe(2);
    expect(boxChildren[0].text).toContain("bold:testTool");
    expect(boxChildren[0].text).toContain("muted:arg1=value1");

    // Loader should be added
    expect(boxChildren[1]).toBe(loaderInstance);

    // Check render
    expect(component.render(100)).toEqual(["rendered box"]);
  });

  it("summarizes long arguments correctly and clips total summary length", () => {
    const args = {
      shortStr: "hello",
      longStr: "this is a very long string that should be truncated because it exceeds thirty characters",
      num: 42,
      obj: { key: "val" }
    };

    new ToolExecutionComponent("testTool", args, tui);

    const headerText = boxChildren[0].text;
    expect(headerText).toContain("bold:testTool");

    // "longStr" value should be truncated to 27 chars + "..." (30 chars)
    expect(headerText).toContain("this is a very long string ...");
    expect(headerText).not.toContain("exceeds thirty characters");

    // other args should be present if they fit
    expect(headerText).toContain("shortStr=hello");
    expect(headerText).toContain("num=42");
    expect(headerText).toContain('obj={"key":"val"}');
  });

  it("updates result with success", () => {
    const component = new ToolExecutionComponent("testTool", {}, tui);

    component.updateResult({ text: "Success output", isError: false });

    // Loader should be stopped
    expect(loaderInstance.stop).toHaveBeenCalled();

    // Box bg should be updated to success
    expect(boxBgFn).toBeDefined();
    if (boxBgFn) expect(boxBgFn("test")).toBe("toolSuccessBg:test");

    // Output text should be added
    expect(boxChildren.length).toBe(2); // Header + Output
    expect(boxChildren[1].text).toContain("muted:Success output");
  });

  it("updates result with error", () => {
    const component = new ToolExecutionComponent("testTool", {}, tui);

    component.updateResult({ text: "Error output", isError: true });

    // Loader should be stopped
    expect(loaderInstance.stop).toHaveBeenCalled();

    // Box bg should be updated to error
    expect(boxBgFn).toBeDefined();
    if (boxBgFn) expect(boxBgFn("test")).toBe("toolErrorBg:test");

    // Output text should be added with error color
    expect(boxChildren.length).toBe(2); // Header + Output
    expect(boxChildren[1].text).toContain("error:Error output");
  });

  it("collapses long output to 5 lines by default", () => {
    const component = new ToolExecutionComponent("testTool", {}, tui);

    const longOutput = Array.from({length: 10}, (_, i) => `Line ${i+1}`).join("\n");
    component.updateResult({ text: longOutput, isError: false });

    // Should have header, 5 lines of output, and the "more lines" indicator
    expect(boxChildren.length).toBe(3);

    const outputText = boxChildren[1].text;
    expect(outputText).toContain("Line 1");
    expect(outputText).toContain("Line 5");
    expect(outputText).not.toContain("Line 6");

    expect(boxChildren[2].text).toContain("dim:... (5 more lines, Ctrl+E to expand)");
  });

  it("expands long output when requested", () => {
    const component = new ToolExecutionComponent("testTool", {}, tui);

    const longOutput = Array.from({length: 10}, (_, i) => `Line ${i+1}`).join("\n");
    component.updateResult({ text: longOutput, isError: false });

    component.setExpanded(true);

    // Should have header, and all lines of output
    expect(boxChildren.length).toBe(2);

    const outputText = boxChildren[1].text;
    expect(outputText).toContain("Line 1");
    expect(outputText).toContain("Line 10");
  });

  it("invalidates correctly", () => {
    const component = new ToolExecutionComponent("testTool", {}, tui);
    // Grab the mock instance from our mock setup
    const { Box } = require("@mariozechner/pi-tui");

    component.invalidate();

    expect(loaderInstance.invalidate).toHaveBeenCalled();
  });
});
