import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConversationsSidebar } from "../../src/components/ConversationsSidebar";

// Mock AppContext
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

  it("renders delete button with correct aria-label", async () => {
    mockUseApp.mockReturnValue({
      conversations: [
        {
          id: "c1",
          title: "Test Chat",
          updatedAt: new Date().toISOString(),
        },
      ],
      activeConversationId: "c1",
      unreadConversations: new Set(),
      handleSelectConversation: vi.fn(),
      handleDeleteConversation: vi.fn(),
      handleNewConversation: vi.fn(),
      handleRenameConversation: vi.fn(),
    });

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(ConversationsSidebar));
    });

    const deleteBtn = tree.root.findByProps({ "data-testid": "conv-delete" });

    // Expect the aria-label to be present and correct
    expect(deleteBtn.props["aria-label"]).toBe("Delete conversation Test Chat");

    // Expect the child to be an element with aria-hidden (not just text "×")
    const icon = deleteBtn.children[0];
    expect(typeof icon).not.toBe("string");
    if (typeof icon !== "string") {
        expect(icon.type).toBe("span");
        expect(icon.props["aria-hidden"]).toBe("true");
        expect(icon.children[0]).toBe("×");
    }
  });
});
