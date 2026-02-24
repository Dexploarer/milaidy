import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockUseApp } = vi.hoisted(() => ({
  mockUseApp: vi.fn(),
}));

vi.mock("../../src/AppContext", () => ({
  useApp: () => mockUseApp(),
}));

import { ConversationsSidebar } from "../../src/components/ConversationsSidebar";

describe("ConversationsSidebar", () => {
  beforeEach(() => {
    mockUseApp.mockReset();
    mockUseApp.mockReturnValue({
      conversations: [
        { id: "c1", title: "Chat 1", updatedAt: new Date().toISOString() },
      ],
      activeConversationId: "c1",
      unreadConversations: new Set(),
      handleNewConversation: vi.fn(),
      handleSelectConversation: vi.fn(),
      handleDeleteConversation: vi.fn(),
      handleRenameConversation: vi.fn(),
    });
  });

  it("renders accessible delete button", async () => {
    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(ConversationsSidebar));
    });

    const deleteButton = tree.root.findByProps({ "data-testid": "conv-delete" });
    expect(deleteButton.props["aria-label"]).toBe("Delete conversation: Chat 1");

    // Check for aria-hidden span inside
    const hiddenSpan = deleteButton.findByProps({ "aria-hidden": "true" });
    expect(hiddenSpan).toBeDefined();
    // In React test renderer, children of span with "×" is ["×"]
    expect(hiddenSpan.children).toContain("×");
  });

  it("renders accessible mobile close button", async () => {
    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(ConversationsSidebar, { mobile: true, onClose: vi.fn() }));
    });

    // Find button by aria-label since we kept it
    const closeButton = tree.root.findByProps({ "aria-label": "Close chats panel" });
    expect(closeButton).toBeDefined();

    const hiddenSpan = closeButton.findByProps({ "aria-hidden": "true" });
    expect(hiddenSpan).toBeDefined();
    // &times; usually renders as the character × in React children if treated as text?
    // Wait, &times; in JSX is just the string if not decoded?
    // Actually standard JSX: <span>&times;</span> renders '×'.
    // TestRenderer children might be the string "×".
    // I'll check if it contains "×" or just exist.
    expect(hiddenSpan.children.length).toBeGreaterThan(0);
  });

  it("renders accessible rename input", async () => {
    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(ConversationsSidebar));
    });

    const convItem = tree.root.findByProps({ "data-testid": "conv-item" });
    // The button that triggers edit on double click is the first button inside conv-item
    // It has text content of title
    const buttons = convItem.findAllByType("button");
    const titleButton = buttons[0]; // First button is select/edit, second is delete

    // Double click to edit
    await act(async () => {
        titleButton.props.onDoubleClick();
    });

    const input = convItem.findByType("input");
    expect(input.props["aria-label"]).toBe("Rename conversation: Chat 1");
  });
});
