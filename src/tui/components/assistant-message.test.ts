import { describe, expect, it, vi, beforeEach } from "vitest";
import { AssistantMessageComponent } from "./assistant-message.js";

let markdownInstances: any[] = [];
let imageInstances: any[] = [];

vi.mock("@mariozechner/pi-tui", () => {
  return {
    Markdown: class Markdown {
      constructor(public text: string, top: number, left: number, theme: any, options: any) {
        markdownInstances.push(this);
      }
      setText = vi.fn((text) => { this.text = text; });
      render = vi.fn().mockImplementation((w) => this.text ? [this.text] : []);
      invalidate = vi.fn();
    },
    Image: class Image {
      constructor(base64: string, mimeType: string, theme: any, options: any) {
        imageInstances.push(this);
      }
      render = vi.fn().mockReturnValue(["[Image]"]);
      invalidate = vi.fn();
    }
  };
});

vi.mock("../theme.js", () => {
  return {
    miladyMarkdownTheme: { mockTheme: true },
    tuiTheme: {
      muted: vi.fn((t) => `muted:${t}`),
      dim: vi.fn((t) => `dim:${t}`)
    }
  };
});

describe("AssistantMessageComponent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    markdownInstances = [];
    imageInstances = [];
  });

  it("initializes empty and streaming", () => {
    const component = new AssistantMessageComponent();
    expect(component).toBeDefined();

    // Empty output initially
    const rendered = component.render(100);
    expect(rendered).toEqual([]);
  });

  it("updates content and renders with streaming cursor", () => {
    const component = new AssistantMessageComponent();

    component.updateContent("Hello");

    // The main markdown should be instantiated on construction
    const md = markdownInstances[0];
    expect(md.setText).toHaveBeenCalledWith("Hello ▊");

    const rendered = component.render(100);
    expect(rendered).toEqual(["", "Hello ▊"]);
  });

  it("finalizes and removes streaming cursor", () => {
    const component = new AssistantMessageComponent();

    component.updateContent("Hello");
    component.finalize();

    const md = markdownInstances[0];
    expect(md.setText).toHaveBeenCalledWith("Hello");

    const rendered = component.render(100);
    expect(rendered).toEqual(["", "Hello"]);
  });

  it("shows thinking text when enabled", () => {
    const component = new AssistantMessageComponent(true);

    // updateThinking triggers a rebuild which creates a new Markdown instance
    component.updateThinking("Hmm...");
    component.updateContent("Yes");
    component.finalize();

    // We expect multiple instances due to rebuilds, but we care about the render output
    const rendered = component.render(100);
    expect(rendered).toEqual([
      "",
      "Hmm...",
      "",
      "Yes"
    ]);
  });

  it("ignores thinking text when disabled", () => {
    const component = new AssistantMessageComponent(false);

    component.updateThinking("Hmm...");
    component.updateContent("Yes");
    component.finalize();

    const rendered = component.render(100);
    expect(rendered).toEqual(["", "Yes"]);
  });

  it("adds and renders images", () => {
    const component = new AssistantMessageComponent();

    component.updateContent("Look at this");
    component.finalize();

    component.addImage({
      base64: "dGVzdA==",
      mimeType: "image/png",
      filename: "test.png"
    });

    expect(imageInstances.length).toBe(1);

    const rendered = component.render(100);
    expect(rendered).toEqual([
      "",
      "Look at this",
      "", // spacer
      "[Image]"
    ]);
  });

  it("invalidates all sub-components", () => {
    const component = new AssistantMessageComponent(true);
    component.updateThinking("Hmm");
    component.addImage({ base64: "dGVzdA==", mimeType: "image/png" });

    component.invalidate();

    // Check that at least some invalidates were called
    const someMarkdownInvalidated = markdownInstances.some(md => md.invalidate.mock.calls.length > 0);
    expect(someMarkdownInvalidated).toBe(true);
    expect(imageInstances[0].invalidate).toHaveBeenCalled();
  });
});
