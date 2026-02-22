import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConversationsSidebar } from "../../src/components/ConversationsSidebar";

// Mock useApp
const mockUseApp = vi.fn();

vi.mock("../../src/AppContext", () => ({
  useApp: () => mockUseApp(),
}));

describe("ConversationsSidebar", () => {
  beforeEach(() => {
    mockUseApp.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders delete button with accessible attributes and focus styles", async () => {
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

    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(ConversationsSidebar));
    });

    if (!tree) throw new Error("Component failed to render");

    const root = tree.root;

    // Find the delete button
    // It should have data-testid="conv-delete"
    const deleteButton = root.findByProps({ "data-testid": "conv-delete" });

    // Assert accessibility label
    expect(deleteButton.props["aria-label"]).toBe("Delete conversation");

    // Assert visibility on focus
    expect(deleteButton.props.className).toContain("focus:opacity-100");

    // Assert icon is hidden from screen readers
    // We expect a span inside with aria-hidden="true"
    // Find span child
    const span = deleteButton.findByType("span");
    expect(span.props["aria-hidden"]).toBe("true");

    // Check if the content is correct
    // Depending on implementation, it might be children of span
    expect(span.children).toContain("×");
  });
});
