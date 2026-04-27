import { describe, expect, it, vi, beforeEach } from "vitest";
import { UserMessageComponent } from "./user-message.js";

let markdownText = "";
let markdownThemeRef = null;
let markdownOptions = null;

vi.mock("@mariozechner/pi-tui", () => {
  return {
    Markdown: class Markdown {
      constructor(text, top, left, theme, options) {
        markdownText = text;
        markdownThemeRef = theme;
        markdownOptions = options;
      }
      render = vi.fn().mockReturnValue(["md line 1", "md line 2"]);
      invalidate = vi.fn();
    }
  };
});

vi.mock("../theme.js", () => {
  return {
    miladyMarkdownTheme: { mockTheme: true },
    tuiTheme: {
      userMsgBg: vi.fn((t) => `bg:${t}`)
    }
  };
});

describe("UserMessageComponent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    markdownText = "";
    markdownThemeRef = null;
    markdownOptions = null;
  });

  it("initializes with text and default theme", () => {
    const text = "Hello world";
    const component = new UserMessageComponent(text);

    expect(component).toBeDefined();
    expect(markdownText).toBe(text);
    expect(markdownThemeRef).toEqual({ mockTheme: true });

    // Check bgColor mapping
    expect(markdownOptions).toBeDefined();
    expect(markdownOptions.bgColor).toBeDefined();
    expect(markdownOptions.bgColor("test")).toBe("bg:test");
  });

  it("renders with blank line prepended", () => {
    const component = new UserMessageComponent("test");
    const rendered = component.render(100);

    expect(rendered.length).toBe(3);
    expect(rendered[0]).toBe("");
    expect(rendered[1]).toBe("md line 1");
    expect(rendered[2]).toBe("md line 2");
  });

  it("invalidates correctly", () => {
    const component = new UserMessageComponent("test");

    // Get the markdown instance
    const mdInstance = (component as any).markdown;

    component.invalidate();

    expect(mdInstance.invalidate).toHaveBeenCalled();
  });
});
