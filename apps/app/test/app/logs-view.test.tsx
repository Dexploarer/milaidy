import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockUseApp } = vi.hoisted(() => ({
  mockUseApp: vi.fn(),
}));

vi.mock("../../src/AppContext", () => ({
  useApp: () => mockUseApp(),
}));

import { LogsView } from "../../src/components/LogsView";

describe("LogsView", () => {
  const baseLogs = [
    {
      timestamp: 1678900000000,
      level: "info",
      source: "system",
      message: "System started",
      tags: ["system"],
    },
    {
      timestamp: 1678900001000,
      level: "error",
      source: "agent",
      message: "Agent failed",
      tags: ["agent", "error"],
    },
  ];

  beforeEach(() => {
    mockUseApp.mockReset();
    mockUseApp.mockReturnValue({
      logs: baseLogs,
      logSources: ["system", "agent"],
      logTags: ["system", "agent", "error"],
      logTagFilter: "",
      logLevelFilter: "",
      logSourceFilter: "",
      loadLogs: vi.fn().mockResolvedValue(undefined),
      setState: vi.fn(),
    });
  });

  it("renders log entries", async () => {
    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(LogsView));
    });

    const entries = tree?.root.findAllByProps({ "data-testid": "log-entry" });
    expect(entries).toHaveLength(2);

    const firstEntry = entries[0];
    const text = firstEntry.findAllByType("span").map(n => n.children.join("")).join(" ");
    expect(text).toContain("System started");
    expect(text).toContain("info");
    expect(text).toContain("[system]");
  });

  it("filters logs by search query", async () => {
    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(LogsView));
    });

    const input = tree?.root.findByType("input");

    await act(async () => {
      input.props.onChange({ target: { value: "failed" } });
    });

    const entries = tree?.root.findAllByProps({ "data-testid": "log-entry" });
    expect(entries).toHaveLength(1);
    const text = entries[0].findAllByType("span").map(n => n.children.join("")).join(" ");
    expect(text).toContain("Agent failed");
  });
});
