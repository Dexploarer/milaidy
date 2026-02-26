import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockUseApp } = vi.hoisted(() => ({
  mockUseApp: vi.fn(),
}));

vi.mock("../../src/AppContext", () => ({
  useApp: () => mockUseApp(),
}));

// Mock ConfirmDeleteControl to simplify testing its interaction
vi.mock("../../src/components/shared/confirm-delete-control", () => ({
  ConfirmDeleteControl: ({
    onConfirm,
    triggerTitle,
  }: { onConfirm: () => void; triggerTitle: string }) => (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onConfirm();
      }}
      data-testid="mock-delete-btn"
      title={triggerTitle}
    >
      Mock Delete
    </button>
  ),
}));

import { ConversationsSidebar } from "../../src/components/ConversationsSidebar";

describe("ConversationsSidebar", () => {
  const defaultContext = {
    conversations: [
      { id: "c1", title: "Chat 1", updatedAt: new Date().toISOString() },
      { id: "c2", title: "Chat 2", updatedAt: new Date().toISOString() },
    ],
    activeConversationId: "c1",
    unreadConversations: new Set(),
    handleNewConversation: vi.fn(),
    handleSelectConversation: vi.fn(),
    handleDeleteConversation: vi.fn(),
    handleRenameConversation: vi.fn(),
  };

  beforeEach(() => {
    mockUseApp.mockReturnValue(defaultContext);
  });

  it("renders conversation list", () => {
    let tree: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(React.createElement(ConversationsSidebar));
    });

    const items = tree!.root.findAllByProps({ "data-testid": "conv-item" });
    expect(items.length).toBe(2);
    expect(items[0].props["data-active"]).toBe(true); // c1 is active
  });

  it("uses ConfirmDeleteControl for deletion", () => {
    let tree: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(React.createElement(ConversationsSidebar));
    });

    const deleteBtns = tree!.root.findAllByProps({
      "data-testid": "mock-delete-btn",
    });
    expect(deleteBtns.length).toBe(2);

    // Verify title prop is passed correctly
    expect(deleteBtns[0].props.title).toBe("Delete conversation");

    act(() => {
      // Simulate click which triggers onConfirm in our mock
      deleteBtns[0].props.onClick({ stopPropagation: vi.fn() });
    });

    expect(defaultContext.handleDeleteConversation).toHaveBeenCalledWith("c1");
  });
});
