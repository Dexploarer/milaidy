import { describe, it, expect, vi } from "vitest";
import { filterBootstrapFilesForSession } from "./workspace.js";
import type { WorkspaceBootstrapFile } from "./workspace.js";

// Mock dependencies
vi.mock("@elizaos/core", () => {
  return {
    isSubagentSessionKey: vi.fn((key) => key.startsWith("subagent:")),
    logger: {
      warn: vi.fn(),
    },
  };
});

describe("filterBootstrapFilesForSession", () => {
  const allFiles: WorkspaceBootstrapFile[] = [
    { name: "AGENTS.md", path: "/path/AGENTS.md", missing: false, content: "agents" },
    { name: "TOOLS.md", path: "/path/TOOLS.md", missing: false, content: "tools" },
    { name: "IDENTITY.md", path: "/path/IDENTITY.md", missing: false, content: "identity" },
    { name: "USER.md", path: "/path/USER.md", missing: false, content: "user" },
    { name: "HEARTBEAT.md", path: "/path/HEARTBEAT.md", missing: false, content: "heartbeat" },
    { name: "BOOTSTRAP.md", path: "/path/BOOTSTRAP.md", missing: false, content: "bootstrap" },
  ];

  it("returns all files if sessionKey is undefined", () => {
    const result = filterBootstrapFilesForSession(allFiles, undefined);
    expect(result).toHaveLength(allFiles.length);
  });

  it("returns all files if sessionKey is not a subagent key", () => {
    const result = filterBootstrapFilesForSession(allFiles, "agent:main");
    expect(result).toHaveLength(allFiles.length);
  });

  it("returns only allowlisted files if sessionKey is a subagent key", () => {
    const result = filterBootstrapFilesForSession(allFiles, "subagent:123");
    // Allowlist: AGENTS.md, TOOLS.md
    expect(result).toHaveLength(2);
    expect(result.map((f) => f.name)).toContain("AGENTS.md");
    expect(result.map((f) => f.name)).toContain("TOOLS.md");
    expect(result.map((f) => f.name)).not.toContain("IDENTITY.md");
  });
});
