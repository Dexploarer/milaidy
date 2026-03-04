import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import * as AppContext from "../../src/AppContext";
import { LogsView } from "../../src/components/LogsView";

// Mock the AppContext
vi.mock("../../src/AppContext", () => ({
  useApp: vi.fn(),
}));

describe("LogsView", () => {
  it("renders logs correctly", async () => {
    const mockUseApp = {
      logs: [
        {
          timestamp: 1234567890000,
          source: "test-source",
          level: "info",
          message: "Test log message",
          tags: ["test-tag"],
        },
      ],
      logSources: ["test-source"],
      logTags: ["test-tag"],
      logTagFilter: "",
      logLevelFilter: "",
      logSourceFilter: "",
      loadLogs: vi.fn(),
      setState: vi.fn(),
    };

    // @ts-expect-error - partial mock
    vi.spyOn(AppContext, "useApp").mockReturnValue(mockUseApp);

    let testRenderer: ReactTestRenderer | undefined;
    await act(async () => {
      testRenderer = create(<LogsView />);
    });

    if (!testRenderer) throw new Error("Renderer not initialized");

    const root = testRenderer.root;
    // Check if log entry exists
    const logEntries = root.findAllByProps({ "data-testid": "log-entry" });
    expect(logEntries.length).toBe(1);

    // Check content
    // Check for text content in the rendered tree
    const treeJson = JSON.stringify(testRenderer.toJSON());
    expect(treeJson).toContain("Test log message");
    expect(treeJson).toContain("info");
    expect(treeJson).toContain("test-source");
  });

  it("renders 'No log entries' when empty", async () => {
    const mockUseApp = {
      logs: [],
      logSources: [],
      logTags: [],
      logTagFilter: "",
      logLevelFilter: "",
      logSourceFilter: "",
      loadLogs: vi.fn(),
      setState: vi.fn(),
    };

    // @ts-expect-error - partial mock
    vi.spyOn(AppContext, "useApp").mockReturnValue(mockUseApp);

    let testRenderer: ReactTestRenderer | undefined;
    await act(async () => {
      testRenderer = create(<LogsView />);
    });

    if (!testRenderer) throw new Error("Renderer not initialized");

    const root = testRenderer.root;
    const logEntries = root.findAllByProps({ "data-testid": "log-entry" });
    expect(logEntries.length).toBe(0);

    const treeJson = JSON.stringify(testRenderer.toJSON());
    expect(treeJson).toContain("No log entries");
  });
});
