import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { ConversationsSidebar } from "../../src/components/ConversationsSidebar";

// Mock AppContext
vi.mock("../../src/AppContext", () => ({
  useApp: () => ({
    conversations: [
      { id: "1", title: "Chat 1", updatedAt: new Date().toISOString() },
    ],
    activeConversationId: "1",
    unreadConversations: new Set(),
    handleNewConversation: vi.fn(),
    handleSelectConversation: vi.fn(),
    handleDeleteConversation: vi.fn(),
    handleRenameConversation: vi.fn(),
  }),
}));

describe("ConversationsSidebar Accessibility", () => {
  it("renders with accessible labels", () => {
    let tree: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(<ConversationsSidebar />);
    });

    const root = tree.root;

    // Check "New Chat" button
    const buttons = root.findAllByType("button");
    const newChatBtn = buttons.find(
      (btn) => btn.props.children === "+ New Chat"
    );
    expect(newChatBtn).toBeDefined();
    expect(newChatBtn?.props["aria-label"]).toBe("Start a new chat");

    // Check "Delete" button
    const deleteBtn = root.findByProps({ "data-testid": "conv-delete" });
    expect(deleteBtn.props["aria-label"]).toBe("Delete conversation");
    expect(deleteBtn.props.className).toContain("focus:opacity-100");
  });

  it("renders accessible input when renaming", () => {
    let tree: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(<ConversationsSidebar />);
    });

    const root = tree.root;

    // Find the conversation button to double click
    // The structure is roughly:
    // <div data-testid="conv-item">
    //   <button ... onDoubleClick={...}>
    //     ...
    //   </button>
    //   ...
    // </div>
    const item = root.findByProps({ "data-testid": "conv-item" });
    const convBtn = item.findAllByType("button")[0]; // The first button inside the item is the conversation button

    // Trigger double click to enter edit mode
    act(() => {
      convBtn.props.onDoubleClick();
    });

    // Now check for input
    const input = root.findByType("input");
    expect(input).toBeDefined();
    expect(input.props["aria-label"]).toBe("Rename conversation");
  });
});
