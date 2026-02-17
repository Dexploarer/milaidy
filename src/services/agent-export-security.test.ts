import crypto from "node:crypto";
import type {
  Agent,
  AgentRuntime,
  Component,
  Entity,
  IDatabaseAdapter,
  Log,
  Memory,
  Relationship,
  Room,
  Task,
  UUID,
  World,
} from "@elizaos/core";
import { describe, expect, it } from "vitest";
import { importAgent } from "./agent-export.js";

// Minimal mock setup
function uuid(): UUID {
  return crypto.randomUUID() as UUID;
}

const AGENT_ID = uuid();

function makeAgent(overrides: Partial<Agent> = {}): Agent {
  return {
    id: AGENT_ID,
    name: "TestAgent",
    username: "testagent",
    enabled: true,
    bio: ["A test agent"],
    system: "You are a test agent.",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  } as Agent;
}

interface MockDb {
  agents: Map<string, Agent>;
  memories: Memory[];
  entities: Map<string, Entity>;
  rooms: Map<string, Room>;
  worlds: Map<string, World>;
  relationships: Relationship[];
  components: Component[];
  tasks: Task[];
  logs: Log[];
  participants: Map<
    string,
    { entityIds: UUID[]; userStates: Map<string, string | null> }
  >;
  // Track calls to createMemory
  createMemoryCalls: Array<{ memory: Memory; tableName: string }>;
}

function createMockDb(): MockDb {
  return {
    agents: new Map(),
    memories: [],
    entities: new Map(),
    rooms: new Map(),
    worlds: new Map(),
    relationships: [],
    components: [],
    tasks: [],
    logs: [],
    participants: new Map(),
    createMemoryCalls: [],
  };
}

function createMockRuntime(db: MockDb): AgentRuntime {
  const adapter = {
    // Only implement what's needed for importAgent
    createAgent: async (agent: Partial<Agent>) => {
      db.agents.set(agent.id ?? "", agent as Agent);
      return true;
    },
    createWorld: async (world: World) => {
      db.worlds.set(world.id ?? "", world);
      return world.id ?? "";
    },
    createRooms: async (rooms: Room[]) => {
      for (const room of rooms) db.rooms.set(room.id ?? "", room);
      return rooms.map((r) => r.id ?? "");
    },
    createEntities: async (entities: Entity[]) => {
      for (const entity of entities) db.entities.set(entity.id ?? "", entity);
      return true;
    },
    addParticipantsRoom: async () => true,
    setParticipantUserState: async () => {},
    createComponent: async (component: Component) => {
      db.components.push(component);
      return true;
    },
    createMemory: async (memory: Memory, tableName: string) => {
      db.memories.push(memory);
      db.createMemoryCalls.push({ memory, tableName });
      return memory.id ?? "";
    },
    createRelationship: async (rel) => {
      db.relationships.push(rel as Relationship);
      return true;
    },
    createTask: async (task: Task) => {
      db.tasks.push(task);
      return task.id ?? "";
    },
    log: async () => {},

    // For export (not focus of this test but needed if we export first)
    getAgent: async () => db.agents.get(AGENT_ID),
    getAllWorlds: async () => [],
    getRoomsByWorld: async () => [],
    getRoomsForParticipant: async () => [],
    getEntitiesForRoom: async () => [],
    getParticipantsForRoom: async () => [],
    getComponents: async () => [],
    getMemories: async ({ tableName }) => {
      // Allow retrieving memories with arbitrary types for the exploit test
      return db.memories.filter(
        (m) => (m as unknown as Record<string, unknown>).type === tableName,
      );
    },
    getRelationships: async () => [],
    getTasks: async () => [],
    getLogs: async () => [],
  } as unknown as IDatabaseAdapter<object>;

  return {
    agentId: AGENT_ID,
    adapter,
    character: { name: "TestAgent" },
  } as unknown as AgentRuntime;
}

describe("Security: Memory Table Name Injection", () => {
  it("prevents arbitrary table names in importAgent", async () => {
    // 1. Setup a source DB with a malicious memory type
    const sourceDb = createMockDb();
    sourceDb.agents.set(AGENT_ID, makeAgent());

    // Malicious memory
    const maliciousType = "messages; DROP TABLE users; --";
    const maliciousMemory = {
      id: uuid(),
      agentId: AGENT_ID,
      entityId: uuid(),
      roomId: uuid(),
      content: { text: "evil" },
      metadata: { type: "message" }, // Normal metadata
      type: maliciousType, // Top-level type is used as fallback if metadata.type is unknown or missing?
      // Wait, resolveMemoryTableName prioritizes metadata.type if it matches known types.
      // So we need metadata.type to be missing or unknown.
      createdAt: Date.now(),
    } as unknown as Memory;

    // Ensure metadata.type doesn't match known types to trigger fallback
    delete maliciousMemory.metadata;

    sourceDb.memories.push(maliciousMemory);

    // 2. Export (this will include the malicious memory)
    // We need to patch getMemories to return our malicious memory when queried.
    // The export function queries MEMORY_TABLES. "messages; DROP TABLE users; --" is NOT in MEMORY_TABLES.
    // So exportAgent won't even find it if we rely on standard export logic!

    // BUT, an attacker can craft the .eliza-agent file manually.
    // We can simulate this by manually crafting the payload buffer or by patching exportAgent logic in the test
    // to include our memory.

    // Let's manually craft the payload instead of relying on exportAgent.
    const { gzipSync } = await import("node:zlib");
    const nodeCrypto = await import("node:crypto");

    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      sourceAgentId: AGENT_ID,
      agent: makeAgent(),
      entities: [],
      memories: [maliciousMemory],
      components: [],
      rooms: [],
      participants: [],
      relationships: [],
      worlds: [],
      tasks: [],
      logs: [],
    };

    const compressed = gzipSync(Buffer.from(JSON.stringify(payload), "utf-8"));
    const password = "pass";
    const salt = nodeCrypto.randomBytes(32);
    const iv = nodeCrypto.randomBytes(12);
    const key = nodeCrypto.pbkdf2Sync(password, salt, 600_000, 32, "sha256");
    const cipher = nodeCrypto.createCipheriv("aes-256-gcm", key, iv);
    const ciphertext = Buffer.concat([
      cipher.update(compressed),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    const iterBuf = Buffer.alloc(4);
    iterBuf.writeUInt32BE(600_000, 0);
    const fileBuffer = Buffer.concat([
      Buffer.from("ELIZA_AGENT_V1\n", "utf-8"),
      iterBuf,
      salt,
      iv,
      tag,
      ciphertext,
    ]);

    // 3. Import
    const targetDb = createMockDb();
    const targetRuntime = createMockRuntime(targetDb);

    // We expect this to either fail (if we fix it) or succeed (vulnerable)
    // Currently vulnerable:
    try {
      await importAgent(targetRuntime, fileBuffer, password);
    } catch (e) {
      // If it throws "Invalid table name", we are good.
      if (e.message.includes("Invalid memory table name")) {
        return; // Pass
      }
      throw e;
    }

    // If we reach here, check what table name was passed to createMemory
    const call = targetDb.createMemoryCalls.find(
      (c) => c.memory.content.text === "evil",
    );
    expect(call).toBeDefined();

    // Assert that the table name is NOT the malicious one
    // If it IS the malicious one, the test fails (demonstrating vulnerability)
    if (call?.tableName === maliciousType) {
      throw new Error(
        `VULNERABILITY DETECTED: createMemory called with malicious table name: "${call.tableName}"`,
      );
    }
  });
});
