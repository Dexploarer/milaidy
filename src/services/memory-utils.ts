import type { Memory } from "@elizaos/core";

// Memory table names we need to export. The adapter's getMemories requires
// a tableName parameter. These are the known built-in table names used by
// ElizaOS. We query each individually and merge the results.
export const MEMORY_TABLES = [
  "messages",
  "facts",
  "documents",
  "fragments",
  "descriptions",
  "character_modifications",
  "custom",
] as const;

// Map memory metadata types to table names
const MEMORY_TABLE_MAP: Record<string, string> = {
  message: "messages",
  document: "documents",
  fragment: "fragments",
  description: "descriptions",
  custom: "custom",
};

/**
 * Resolve the memory table name from a memory record's metadata.
 * The ElizaOS adapter requires a tableName for createMemory.
 */
export function resolveMemoryTableName(mem: Memory): string {
  const metaType = mem.metadata?.type;
  if (metaType && MEMORY_TABLE_MAP[metaType]) {
    return MEMORY_TABLE_MAP[metaType];
  }

  // Fallback: use the "type" field on the memory itself (ElizaOS stores it
  // as a top-level field in the DB row, which the proto Memory type inherits).
  // Access via unknown to satisfy strict type checking.
  const memType = (mem as unknown as Record<string, unknown>).type;
  if (typeof memType === "string" && memType.length > 0) return memType;

  return "messages";
}
