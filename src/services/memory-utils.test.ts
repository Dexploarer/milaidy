import type { Memory } from "@elizaos/core";
import { describe, expect, it } from "vitest";
import { MEMORY_TABLES, resolveMemoryTableName } from "./memory-utils.js";

function makeMemory(overrides: Partial<Memory> = {}): Memory {
  return {
    id: "test-id",
    agentId: "agent-id",
    userId: "user-id",
    roomId: "room-id",
    content: { text: "test" },
    createdAt: Date.now(),
    ...overrides,
  } as unknown as Memory;
}

describe("memory-utils", () => {
  describe("resolveMemoryTableName", () => {
    it("resolves standard metadata types to table names", () => {
      expect(
        resolveMemoryTableName(makeMemory({ metadata: { type: "message" } })),
      ).toBe("messages");
      expect(
        resolveMemoryTableName(makeMemory({ metadata: { type: "document" } })),
      ).toBe("documents");
      expect(
        resolveMemoryTableName(makeMemory({ metadata: { type: "fragment" } })),
      ).toBe("fragments");
      expect(
        resolveMemoryTableName(
          makeMemory({ metadata: { type: "description" } }),
        ),
      ).toBe("descriptions");
      expect(
        resolveMemoryTableName(makeMemory({ metadata: { type: "custom" } })),
      ).toBe("custom");
    });

    it("falls back to memory.type when metadata is missing", () => {
      const mem = makeMemory();
      // biome-ignore lint/suspicious/noExplicitAny: Testing fallback property
      (mem as any).type = "facts";
      expect(resolveMemoryTableName(mem)).toBe("facts");
    });

    it("falls back to memory.type when metadata.type is unknown", () => {
      const mem = makeMemory({ metadata: { type: "unknown-type" } });
      // biome-ignore lint/suspicious/noExplicitAny: Testing fallback property
      (mem as any).type = "some_table";
      expect(resolveMemoryTableName(mem)).toBe("some_table");
    });

    it("defaults to messages if no type information is available", () => {
      expect(resolveMemoryTableName(makeMemory())).toBe("messages");
    });

    it("defaults to messages if memory.type is empty string", () => {
      const mem = makeMemory();
      // biome-ignore lint/suspicious/noExplicitAny: Testing fallback property
      (mem as any).type = "";
      expect(resolveMemoryTableName(mem)).toBe("messages");
    });
  });

  describe("MEMORY_TABLES", () => {
    it("contains expected table names", () => {
      expect(MEMORY_TABLES).toContain("messages");
      expect(MEMORY_TABLES).toContain("facts");
      expect(MEMORY_TABLES).toContain("documents");
      expect(MEMORY_TABLES).toContain("fragments");
      expect(MEMORY_TABLES).toContain("descriptions");
      expect(MEMORY_TABLES).toContain("character_modifications");
      expect(MEMORY_TABLES).toContain("custom");
    });
  });
});
