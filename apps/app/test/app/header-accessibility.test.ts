import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockUseApp } = vi.hoisted(() => ({
  mockUseApp: vi.fn(),
}));

vi.mock("../../src/AppContext", () => ({
  useApp: () => mockUseApp(),
}));

import { Header } from "../../src/components/Header";

let baseAppState: Record<string, unknown>;

describe("Header Accessibility", () => {
  beforeEach(() => {
    mockUseApp.mockReset();
    baseAppState = {
      agentStatus: { state: "running", agentName: "Milaidy" },
      cloudEnabled: false,
      cloudConnected: false,
      cloudCredits: null,
      cloudCreditsCritical: false,
      cloudCreditsLow: false,
      cloudTopUpUrl: "",
      walletAddresses: { evmAddress: "0x123...456", solanaAddress: "789...abc" },
      lifecycleBusy: false,
      lifecycleAction: null,
      handlePauseResume: vi.fn(),
      handleRestart: vi.fn(),
      openCommandPalette: vi.fn(),
      copyToClipboard: vi.fn(),
      setTab: vi.fn(),
      dropStatus: null,
      loadDropStatus: vi.fn().mockResolvedValue(undefined),
      registryStatus: null,
    };
    mockUseApp.mockReturnValue(baseAppState);
  });

  it("pause/resume button has aria-label", async () => {
    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(Header));
    });

    const pauseButton = tree!.root.find(
      (node) =>
        node.type === "button" &&
        node.props.title === "Pause autonomy"
    );
    expect(pauseButton.props["aria-label"]).toBe("Pause autonomy");
  });

  it("wallet button has aria-label", async () => {
    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(Header));
    });

    // Find the button that calls setTab("wallets")
    // Since we can't easily check the onClick handler directly in TestRenderer without invoking it,
    // we'll look for the button containing the SVG, or rely on the structure.
    // The wallet button is inside .wallet-wrapper (but that's a div).
    // Let's find the button inside the div with class 'wallet-wrapper' if possible,
    // or just search for the button with the specific class or content.

    // The wallet button has an SVG child.
    const buttons = tree!.root.findAllByType("button");
    const walletButton = buttons.find(btn =>
      btn.props.className && btn.props.className.includes("w-7 h-7") &&
      // It has an svg child
      btn.children.length === 1 &&
      typeof btn.children[0] === 'object' &&
      (btn.children[0] as any).type === 'svg'
    );

    expect(walletButton).toBeDefined();
    expect(walletButton!.props["aria-label"]).toBe("View wallet addresses");
  });
});
