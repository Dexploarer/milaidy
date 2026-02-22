import {
  act,
  create,
  type ReactTestInstance,
  type ReactTestRenderer,
} from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import * as AppContext from "../../src/AppContext";
import { ConversationsSidebar } from "../../src/components/ConversationsSidebar";

// Mock the AppContext
vi.mock("../../src/AppContext", () => ({
  useApp: vi.fn(),
}));

describe("ConversationsSidebar", () => {
  it("renders delete button with accessible attributes", async () => {
    const mockConversations = [
      {
        id: "conv-1",
        title: "Test Conversation",
        roomId: "room-1",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    const mockUseApp = {
      conversations: mockConversations,
      activeConversationId: "conv-1",
      unreadConversations: new Set(),
      handleNewConversation: vi.fn(),
      handleSelectConversation: vi.fn(),
      handleDeleteConversation: vi.fn(),
      handleRenameConversation: vi.fn(),
    };

    // @ts-expect-error - partial mock
    vi.spyOn(AppContext, "useApp").mockReturnValue(mockUseApp);

    let testRenderer: ReactTestRenderer | null = null;
    await act(async () => {
      testRenderer = create(<ConversationsSidebar />);
    });

    if (!testRenderer) throw new Error("Failed to render");

    const root = testRenderer.root;

    // Find delete button
    const deleteBtns = root.findAll((node: ReactTestInstance) =>
      node.props["data-testid"] === "conv-delete"
    );

    expect(deleteBtns.length).toBe(1);
    const deleteBtn = deleteBtns[0];

    // Check for accessibility attributes
    expect(deleteBtn.props['aria-label']).toBe("Delete conversation");
    expect(deleteBtn.props.className).toContain("focus:opacity-100");

    // Check if children contain a span with aria-hidden="true"
    const children = deleteBtn.children;
    expect(children.length).toBeGreaterThan(0);

    // Find the span with aria-hidden="true"
    const hiddenSpan = deleteBtn.findAll((node: ReactTestInstance) =>
        node.type === "span" && node.props["aria-hidden"] === "true"
    );

    expect(hiddenSpan.length).toBe(1);
    expect(hiddenSpan[0].children).toContain("×");
  });
});
