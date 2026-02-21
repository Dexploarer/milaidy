
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { MessageContent } from "../../src/components/MessageContent";
import type { ConversationMessage } from "../../src/api-client";

// Mock the AppContext
vi.mock("../../src/AppContext", () => ({
  useApp: vi.fn(() => ({
    // Mock minimal required context values if needed by children (InlinePluginConfig)
    setActionNotice: vi.fn(),
    loadPlugins: vi.fn(),
  })),
}));

describe("MessageContent", () => {
  it("renders plain text message correctly", async () => {
    const message: ConversationMessage = {
      id: "msg-1",
      role: "user",
      text: "Hello world",
      timestamp: Date.now(),
    };

    let testRenderer: ReactTestRenderer | undefined;
    await act(async () => {
      testRenderer = create(<MessageContent message={message} />);
    });

    if (!testRenderer) throw new Error("Renderer not initialized");
    const root = testRenderer.root;

    // Check that the text is rendered
    // MessageContent renders text in a div with className "text-txt whitespace-pre-wrap"
    const textDiv = root.findByProps({ className: "text-txt whitespace-pre-wrap" });
    expect(textDiv.children).toContain("Hello world");
  });

  it("handles empty message gracefully", async () => {
    const message: ConversationMessage = {
      id: "msg-2",
      role: "assistant",
      text: "",
      timestamp: Date.now(),
    };

    let testRenderer: ReactTestRenderer | undefined;
    await act(async () => {
      testRenderer = create(<MessageContent message={message} />);
    });

    if (!testRenderer) throw new Error("Renderer not initialized");
    const root = testRenderer.root;

    // Expect an empty div or null rendering depending on implementation,
    // but based on code: returns <div className="text-txt whitespace-pre-wrap">{message.text}</div>
    const textDiv = root.findByProps({ className: "text-txt whitespace-pre-wrap" });
    // Empty text might result in empty children array or single empty string
    expect(textDiv.children.length === 0 || textDiv.children[0] === "").toBe(true);
  });
});
