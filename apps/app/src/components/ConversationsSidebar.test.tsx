
import React from "react";
import {
  act,
  create,
  type ReactTestInstance,
  type ReactTestRenderer,
} from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import * as AppContext from "../AppContext";
import { ConversationsSidebar } from "./ConversationsSidebar";

// Mock the AppContext
vi.mock("../AppContext", () => ({
  useApp: vi.fn(),
}));

describe("ConversationsSidebar", () => {
  it("renders delete button with accessibility attributes", async () => {
    // Mock the useApp hook return value
    const mockUseApp = {
      conversations: [
        {
          id: "conv-1",
          title: "Test Conversation",
          updatedAt: new Date().toISOString(),
        },
      ],
      activeConversationId: "conv-1",
      unreadConversations: new Set(),
      handleNewConversation: vi.fn(),
      handleSelectConversation: vi.fn(),
      handleDeleteConversation: vi.fn(),
      handleRenameConversation: vi.fn(),
    };

    // @ts-expect-error - test uses a narrowed subset of the full app context type.
    vi.spyOn(AppContext, "useApp").mockReturnValue(mockUseApp);

    let testRenderer: ReactTestRenderer | null = null;
    await act(async () => {
      testRenderer = create(<ConversationsSidebar />);
    });

    if (!testRenderer) {
      throw new Error("Failed to render ConversationsSidebar");
    }
    const root = testRenderer.root;

    // Find the delete button
    // It has testID "conv-delete"
    const deleteButton = root.findByProps({ "data-testid": "conv-delete" });

    expect(deleteButton).toBeTruthy();

    // Check for aria-label
    expect(deleteButton.props["aria-label"]).toBe("Delete conversation");

    // Check for aria-hidden on the content
    // The "×" should be inside a span with aria-hidden="true"
    const span = deleteButton.children[0] as ReactTestInstance;
    expect(span.props["aria-hidden"]).toBe("true");
    expect(span.children).toContain("×");

    // Check for focus visibility class
    expect(deleteButton.props.className).toContain("focus:opacity-100");
  });
});
