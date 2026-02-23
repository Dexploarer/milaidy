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
        {
          id: "conv-1",
          title: "Test Conversation",
          updatedAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
        },
      ],
      activeConversationId: "conv-1",
      unreadConversations: new Set(),
      handleNewConversation: vi.fn(),
      handleSelectConversation: vi.fn(),
      handleDeleteConversation: vi.fn(),
      handleRenameConversation: vi.fn(),
    });
  });

  it("renders delete button with accessible label", async () => {
    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(ConversationsSidebar, {}));
    });

    const deleteButton = tree?.root.findByProps({ "data-testid": "conv-delete" });
    expect(deleteButton).toBeTruthy();

    // Check for aria-label on the button
    // This is expected to fail initially as aria-label is missing
    expect(deleteButton.props["aria-label"]).toBe("Delete conversation");

    // Check that the "×" character is hidden from screen readers
    // We expect a child element (likely a span) to have aria-hidden="true" containing the "×"
    // This is expected to fail initially as "×" is a direct text child
    const hiddenX = deleteButton.findByType("span");
    expect(hiddenX.props["aria-hidden"]).toBe("true");
    expect(hiddenX.children).toContain("×");
  });
});
