import {
  act,
  create,
  type ReactTestInstance,
  type ReactTestRenderer,
} from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import * as AppContext from "../AppContext";
import { Header } from "./Header";

// Mock the AppContext
vi.mock("../AppContext", () => ({
  useApp: vi.fn(),
}));

vi.mock("../hooks/useBugReport", () => ({
  useBugReport: () => ({ isOpen: false, open: vi.fn(), close: vi.fn() }),
}));

describe("Header", () => {
  it("renders wallet overlay with correct hover classes", async () => {
    // Mock the useApp hook return value
    const mockUseApp = {
      agentStatus: { state: "running", agentName: "Milady" },
      cloudEnabled: false,
      cloudConnected: false,
      cloudCredits: null,
      cloudCreditsCritical: false,
      cloudCreditsLow: false,
      cloudTopUpUrl: "",
      walletAddresses: {
        evmAddress: "0x1234567890123456789012345678901234567890",
        solanaAddress: "So11111111111111111111111111111111111111112",
      },
      lifecycleBusy: false,
      lifecycleAction: null,
      handlePauseResume: vi.fn(),
      handleRestart: vi.fn(),
      setTab: vi.fn(),
      dropStatus: null,
      loadDropStatus: vi.fn(),
      registryStatus: null,
      copyToClipboard: vi.fn(), // Needed for CopyButton
    };

    // @ts-expect-error - test uses a narrowed subset of the full app context type.
    vi.spyOn(AppContext, "useApp").mockReturnValue(mockUseApp);

    let testRenderer: ReactTestRenderer | null = null;
    await act(async () => {
      testRenderer = create(<Header />);
    });
    if (!testRenderer) {
      throw new Error("Failed to render Header");
    }
    const root = testRenderer.root;
    const hasClass = (node: ReactTestInstance, className: string): boolean =>
      typeof node.props.className === "string" &&
      node.props.className.includes(className);

    // Find the wallet wrapper
    const walletWrapper = root.findAll((node: ReactTestInstance) =>
      hasClass(node, "wallet-wrapper"),
    );

    expect(walletWrapper.length).toBe(1);
    expect(walletWrapper[0].props.className).toContain("group");

    // Find the wallet tooltip
    const walletTooltip = root.findAll((node: ReactTestInstance) =>
      hasClass(node, "wallet-tooltip"),
    );

    expect(walletTooltip.length).toBe(1);
    expect(walletTooltip[0].props.className).toContain("group-hover:block");

    // Verify CopyButtons are rendered
    const copyButtons = root.findAll((node: ReactTestInstance) => {
      return (
        node.type === "button" &&
        node.props["aria-label"] &&
        node.props["aria-label"].startsWith("Copy")
      );
    });

    // Should find 2 copy buttons (one for EVM, one for SOL)
    expect(copyButtons.length).toBe(2);
  });
});
