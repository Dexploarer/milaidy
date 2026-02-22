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
        { id: "1", title: "Chat 1", updatedAt: new Date().toISOString() },
      ],
      activeConversationId: "1",
      unreadConversations: new Set(),
      handleNewConversation: vi.fn(),
      handleSelectConversation: vi.fn(),
      handleDeleteConversation: vi.fn(),
      handleRenameConversation: vi.fn(),
    });
  });

  it("renders delete button with accessibility attributes", async () => {
    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(ConversationsSidebar));
    });

    const deleteButton = tree.root.findByProps({
      "data-testid": "conv-delete",
    });

    // Check aria-label
    expect(deleteButton.props["aria-label"]).toBe("Delete conversation");

    // Check content is hidden from screen readers
    const children = deleteButton.children;
    expect(children).toHaveLength(1);
    const iconWrapper = children[0];

    // If it's a string (like "×"), it means it's not wrapped in a span with aria-hidden="true"
    // The test expects it to be wrapped in an element with aria-hidden="true"
    expect(typeof iconWrapper).not.toBe("string");

    // Check if the wrapper has aria-hidden="true"
    // Note: TestRenderer represents components as objects with props
    // We assume the implementation will wrap it in a <span aria-hidden="true"> or similar
    if (typeof iconWrapper === "object" && iconWrapper !== null) {
      expect(iconWrapper.props["aria-hidden"]).toBe("true");
    }
  });

  it("renders mobile close button with accessibility attributes", async () => {
    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(
        React.createElement(ConversationsSidebar, { mobile: true }),
      );
    });

    const closeButton = tree.root.findByProps({
      "aria-label": "Close chats panel",
    });

    // Check content is hidden from screen readers
    const children = closeButton.children;
    expect(children).toHaveLength(1);
    const iconWrapper = children[0];

    expect(typeof iconWrapper).not.toBe("string");

    if (typeof iconWrapper === "object" && iconWrapper !== null) {
      expect(iconWrapper.props["aria-hidden"]).toBe("true");
    }
  });
});
