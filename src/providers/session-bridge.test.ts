import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { resolveSessionKeyFromRoom, createSessionKeyProvider } from "./session-bridge.js";
import type { IAgentRuntime, Memory, Room, State } from "@elizaos/core";

// Mock dependencies
vi.mock("@elizaos/core", () => {
  // Mock ChannelType enum
  const ChannelType = {
    DM: "dm",
    SELF: "self",
    GROUP: "group",
    CHANNEL: "channel",
  };

  return {
    buildAgentMainSessionKey: vi.fn(({ agentId, mainKey }) => `agent:${agentId}:${mainKey}`),
    parseAgentSessionKey: vi.fn((key) => {
      const parts = key.split(":");
      if (parts[0] === "agent" && parts.length >= 3) {
        return { agentId: parts[1] };
      }
      return null;
    }),
    ChannelType,
    // Add other mocks as needed
  };
});

// Need to import ChannelType to use in tests, but it's mocked above.
// Since we mocked the module, we can import from it and get our mock.
import { ChannelType, buildAgentMainSessionKey } from "@elizaos/core";

describe("resolveSessionKeyFromRoom", () => {
  const agentId = "test-agent";

  it("resolves session key for DM", () => {
    const room = {
      id: "room-1",
      type: ChannelType.DM,
      source: "discord",
    } as Room;

    const key = resolveSessionKeyFromRoom(agentId, room);
    expect(key).toBe(`agent:${agentId}:main`);
    expect(buildAgentMainSessionKey).toHaveBeenCalledWith({ agentId, mainKey: "main" });
  });

  it("resolves session key for SELF DM", () => {
    const room = {
      id: "room-2",
      type: ChannelType.SELF,
      source: "direct",
    } as Room;

    const key = resolveSessionKeyFromRoom(agentId, room);
    expect(key).toBe(`agent:${agentId}:main`);
  });

  it("resolves session key for GROUP", () => {
    const room = {
      id: "group-1",
      type: ChannelType.GROUP,
      source: "slack",
      channelId: "channel-123",
    } as Room;

    const key = resolveSessionKeyFromRoom(agentId, room);
    // Format: agent:{agentId}:{channel}:group:{groupId}
    expect(key).toBe(`agent:${agentId}:slack:group:channel-123`);
  });

  it("resolves session key for CHANNEL", () => {
    const room = {
      id: "channel-1",
      type: "unknown" as any, // Not DM, SELF, or GROUP -> defaults to channel logic
      source: "telegram",
    } as Room;

    const key = resolveSessionKeyFromRoom(agentId, room);
    // Format: agent:{agentId}:{channel}:channel:{id}
    expect(key).toBe(`agent:${agentId}:telegram:channel:channel-1`);
  });

  it("resolves session key with threadId", () => {
    const room = {
      id: "group-1",
      type: ChannelType.GROUP,
      source: "discord",
      channelId: "channel-123",
    } as Room;

    const meta = { threadId: "thread-456" };
    const key = resolveSessionKeyFromRoom(agentId, room, meta);
    expect(key).toBe(`agent:${agentId}:discord:group:channel-123:thread:thread-456`);
  });

  it("resolves session key with custom groupId", () => {
    const room = {
      id: "group-1",
      type: ChannelType.GROUP,
      source: "discord",
    } as Room;

    const meta = { groupId: "custom-group" };
    const key = resolveSessionKeyFromRoom(agentId, room, meta);
    expect(key).toBe(`agent:${agentId}:discord:group:custom-group`);
  });

  it("resolves session key with custom channel", () => {
    const room = {
      id: "group-1",
      type: ChannelType.GROUP,
      source: "discord",
    } as Room;

    const meta = { channel: "custom-source" };
    const key = resolveSessionKeyFromRoom(agentId, room, meta);
    expect(key).toBe(`agent:${agentId}:custom-source:group:group-1`);
  });
});

describe("createSessionKeyProvider", () => {
  const agentId = "default-agent";
  const runtime = {
    getRoom: vi.fn(),
  } as unknown as IAgentRuntime;
  const state = {} as State;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns existing session key from metadata if present", async () => {
    const provider = createSessionKeyProvider({ defaultAgentId: agentId });
    const message = {
      metadata: { sessionKey: "existing-key" },
    } as unknown as Memory;

    const result = await provider.get(runtime, message, state);

    expect(result).toEqual({
      text: "Session: existing-key",
      values: { sessionKey: "existing-key", agentId }, // mocked parseAgentSessionKey returns null, so it falls back to defaultAgentId
      data: { sessionKey: "existing-key" },
    });
  });

  it("generates main key if room not found", async () => {
    const provider = createSessionKeyProvider({ defaultAgentId: agentId });
    const message = {
      roomId: "missing-room",
      metadata: {},
    } as unknown as Memory;

    (runtime.getRoom as any).mockResolvedValue(null);

    const result = await provider.get(runtime, message, state);

    expect(result).toEqual({
      text: `Session: agent:${agentId}:main`,
      values: { sessionKey: `agent:${agentId}:main` },
      data: { sessionKey: `agent:${agentId}:main` },
    });
  });

  it("generates session key from room", async () => {
    const provider = createSessionKeyProvider({ defaultAgentId: agentId });
    const message = {
      roomId: "room-1",
      metadata: {},
    } as unknown as Memory;

    const room = {
      id: "room-1",
      type: ChannelType.GROUP,
      source: "discord",
      channelId: "channel-1",
    };
    (runtime.getRoom as any).mockResolvedValue(room);

    const result = await provider.get(runtime, message, state);
    const expectedKey = `agent:${agentId}:discord:group:channel-1`;

    expect(result).toEqual({
      text: `Session: ${expectedKey}`,
      values: { sessionKey: expectedKey, isGroup: true },
      data: { sessionKey: expectedKey },
    });
  });

  it("passes metadata (threadId, groupId) to key resolution", async () => {
    const provider = createSessionKeyProvider({ defaultAgentId: agentId });
    const message = {
      roomId: "room-1",
      metadata: { threadId: "thread-1" },
    } as unknown as Memory;

    const room = {
      id: "room-1",
      type: ChannelType.GROUP,
      source: "discord",
      channelId: "channel-1",
    };
    (runtime.getRoom as any).mockResolvedValue(room);

    const result = await provider.get(runtime, message, state);
    const expectedKey = `agent:${agentId}:discord:group:channel-1:thread:thread-1`;

    expect(result).toEqual({
      text: `Session: ${expectedKey}`,
      values: { sessionKey: expectedKey, isGroup: true },
      data: { sessionKey: expectedKey },
    });
  });
});
