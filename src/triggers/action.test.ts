import type { IAgentRuntime, Memory, UUID } from "@elizaos/core";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { createTriggerTaskAction } from "./action";

function makeMessage(text: string): Memory {
  return {
    id: "00000000-0000-0000-0000-000000000300" as UUID,
    roomId: "00000000-0000-0000-0000-000000000301" as UUID,
    entityId: "00000000-0000-0000-0000-000000000302" as UUID,
    agentId: "00000000-0000-0000-0000-000000000303" as UUID,
    content: { text },
    createdAt: Date.now(),
  };
}

describe("createTriggerTaskAction", () => {
  let runtime: IAgentRuntime;
  let createTaskMock: ReturnType<typeof vi.fn>;
  let getTasksMock: ReturnType<typeof vi.fn>;
  let useModelMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    createTaskMock = vi.fn(
      async (_task) => "00000000-0000-0000-0000-000000000777" as UUID,
    );
    getTasksMock = vi.fn(async () => []);
    useModelMock = vi.fn(async () =>
      [
        "<response>",
        "<triggerType>interval</triggerType>",
        "<displayName>Status heartbeat</displayName>",
        "<instructions>Post a status heartbeat.</instructions>",
        "<intervalMs>180000</intervalMs>",
        "<wakeMode>inject_now</wakeMode>",
        "</response>",
      ].join("\n"),
    );

    const runtimePartial: Partial<IAgentRuntime> = {
      agentId: "00000000-0000-0000-0000-000000000303" as UUID,
      enableAutonomy: true,
      useModel: useModelMock,
      getTasks: getTasksMock,
      createTask: createTaskMock,
      getTask: async () => ({
        id: "00000000-0000-0000-0000-000000000777" as UUID,
        name: "TRIGGER_DISPATCH",
        description: "Status heartbeat",
        tags: ["queue", "repeat", "trigger"],
        metadata: {
          trigger: {
            triggerId: "00000000-0000-0000-0000-000000000778" as UUID,
            displayName: "Status heartbeat",
            instructions: "Post a status heartbeat.",
            triggerType: "interval",
            enabled: true,
            wakeMode: "inject_now",
            createdBy: "tester",
            runCount: 0,
            intervalMs: 180000,
          },
        },
      }),
      getService: () =>
        ({
          getAutonomousRoomId: () =>
            "00000000-0000-0000-0000-000000000304" as UUID,
        }) as { getAutonomousRoomId: () => UUID },
      getSetting: () => undefined,
    };
    runtime = runtimePartial as IAgentRuntime;
  });

  test("uses a trigger-specific action name", () => {
    expect(createTriggerTaskAction.name).toBe("CREATE_TRIGGER_TASK");
    expect(createTriggerTaskAction.similes ?? []).not.toContain("CREATE_TASK");
  });

  test("validates trigger language when autonomy is enabled", async () => {
    const valid = await createTriggerTaskAction.validate(
      runtime,
      makeMessage("create a trigger every 3 minutes"),
    );
    expect(valid).toBe(true);
  });

  test("creates trigger task from extraction", async () => {
    const result = await createTriggerTaskAction.handler(
      runtime,
      makeMessage(
        "create a trigger every 3 minutes to post a status heartbeat",
      ),
    );
    expect(result?.success).toBe(true);
    expect(createTaskMock).toHaveBeenCalledTimes(1);
    const taskArg = createTaskMock.mock.calls[0][0];
    expect(taskArg.name).toBe("TRIGGER_DISPATCH");
    expect(taskArg.metadata.trigger.displayName).toBe("Status heartbeat");
  });

  test("returns duplicate response for matching dedupe key", async () => {
    getTasksMock.mockResolvedValueOnce([
      {
        id: "00000000-0000-0000-0000-000000000999" as UUID,
        metadata: {
          trigger: {
            triggerId: "00000000-0000-0000-0000-000000000998" as UUID,
            enabled: true,
            triggerType: "interval",
            instructions: "Post a status heartbeat.",
            intervalMs: 180000,
            createdBy: "00000000-0000-0000-0000-000000000302",
          },
        },
      },
    ]);

    const result = await createTriggerTaskAction.handler(
      runtime,
      makeMessage(
        "create a trigger every 3 minutes to post a status heartbeat",
      ),
    );

    expect(result?.success).toBe(true);
    expect(result?.text).toContain("Equivalent trigger already exists");
    expect(createTaskMock).not.toHaveBeenCalled();
  });

  test("handles empty text gracefully", async () => {
    const result = await createTriggerTaskAction.handler(
      runtime,
      makeMessage("   "),
    );
    expect(result?.success).toBe(false);
    expect(result?.text).toBe("Cannot create a trigger from empty text.");
  });

  test("handles autonomy disabled", async () => {
    const runtimePartial: Partial<IAgentRuntime> = {
      ...runtime,
      enableAutonomy: false,
    };
    const result = await createTriggerTaskAction.handler(
      runtimePartial as IAgentRuntime,
      makeMessage("create a trigger"),
    );
    expect(result?.success).toBe(false);
    expect(result?.text).toContain("Autonomy mode is disabled");
  });

  test("handles triggers disabled globally", async () => {
    const runtimePartial: Partial<IAgentRuntime> = {
      ...runtime,
      getSetting: (key) =>
        key === "MILADY_TRIGGERS_ENABLED" ? "false" : undefined,
    };
    const result = await createTriggerTaskAction.handler(
      runtimePartial as IAgentRuntime,
      makeMessage("create a trigger"),
    );
    expect(result?.success).toBe(false);
    expect(result?.text).toContain("Triggers are disabled");
  });

  test("handles trigger limit reached", async () => {
    getTasksMock.mockResolvedValueOnce(
      Array.from({ length: 50 }, (_, i) => ({
        id: `00000000-0000-0000-0000-${String(i).padStart(12, "0")}` as UUID,
        metadata: {
          trigger: {
            triggerId:
              `00000000-0000-0000-0000-${String(i).padStart(12, "0")}` as UUID,
            enabled: true,
            createdBy: "00000000-0000-0000-0000-000000000302",
            triggerType: "interval",
            instructions: "test",
            intervalMs: 180000,
          },
        },
      })),
    );

    const runtimePartial: Partial<IAgentRuntime> = {
      ...runtime,
      getSetting: (key) =>
        key === "MILADY_TRIGGERS_MAX_ACTIVE" ? "10" : undefined,
    };

    const result = await createTriggerTaskAction.handler(
      runtimePartial as IAgentRuntime,
      makeMessage("create a trigger every 3 minutes"),
    );
    expect(result?.success).toBe(false);
    expect(result?.text).toContain("Trigger limit reached");
  });

  test("handles extraction failure via model", async () => {
    useModelMock.mockRejectedValueOnce(new Error("Model offline"));
    getTasksMock.mockResolvedValueOnce([]);
    const callbackMock = vi.fn();

    createTaskMock.mockResolvedValueOnce(
      "00000000-0000-0000-0000-000000000777" as UUID,
    );

    // We need to provide a runtime logger mock since extraction failure calls runtime.logger.warn
    const runtimePartial: Partial<IAgentRuntime> = {
      ...runtime,
      logger: {
        warn: vi.fn(),
        error: vi.fn(),
        info: vi.fn(),
        debug: vi.fn(),
        log: vi.fn(),
        success: vi.fn(),
      } as unknown as IAgentRuntime["logger"],
      getTask: async () =>
        ({
          id: "00000000-0000-0000-0000-000000000777" as UUID,
          metadata: {
            trigger: {
              triggerType: "interval",
              intervalMs: 180000,
              enabled: true,
            },
          },
        }) as unknown as Parameters<Parameters<IAgentRuntime["getTasks"]>[0]>,
    };

    const result = await createTriggerTaskAction.handler(
      runtimePartial as IAgentRuntime,
      // fallback parses interval out of text? Not necessarily. But if text triggers default fallback with no explicit interval parsed from text (empty intervalMs fallback), it gets an error "interval is required for interval triggers" from normalizeTriggerDraft.
      // Actually, if we don't supply `intervalMs` and default is "interval", it fails validation.
      // Let's test the extraction failure where it falls back and FAILS validation due to missing info.
      makeMessage("create a trigger with nothing else"),
      undefined,
      undefined,
      callbackMock,
    );

    expect(result?.success).toBe(false);
    expect(result?.text).toContain("intervalMs is required");
  });

  test("handles success without callback", async () => {
    const result = await createTriggerTaskAction.handler(
      runtime,
      makeMessage("create a trigger"),
    );
    expect(result?.success).toBe(true);
  });

  test("handles duplicate without callback", async () => {
    getTasksMock.mockResolvedValueOnce([
      {
        id: "00000000-0000-0000-0000-000000000999" as UUID,
        metadata: {
          trigger: {
            enabled: true,
            triggerType: "interval",
            instructions: "Post a status heartbeat.",
            intervalMs: 180000,
            createdBy: "00000000-0000-0000-0000-000000000302",
          },
        },
      },
    ]);
    const result = await createTriggerTaskAction.handler(
      runtime,
      makeMessage(
        "create a trigger every 3 minutes to post a status heartbeat",
      ),
    );
    expect(result?.success).toBe(true);
  });

  test("creates 'once' trigger properly", async () => {
    useModelMock.mockResolvedValueOnce(
      [
        "<response>",
        "<triggerType>once</triggerType>",
        "<scheduledAtIso>2025-01-01T12:00:00Z</scheduledAtIso>",
        "</response>",
      ].join("\n"),
    );
    getTasksMock.mockResolvedValueOnce([]);

    createTaskMock.mockResolvedValueOnce(
      "00000000-0000-0000-0000-000000000777" as UUID,
    );
    const runtimePartial: Partial<IAgentRuntime> = {
      ...runtime,
      getTask: async () =>
        ({
          id: "00000000-0000-0000-0000-000000000777" as UUID,
          metadata: {
            trigger: {
              triggerId: "00000000-0000-0000-0000-000000000778" as UUID,
              triggerType: "once",
              scheduledAtIso: "2025-01-01T12:00:00Z",
              enabled: true,
            },
          },
        }) as unknown as Parameters<Parameters<IAgentRuntime["getTasks"]>[0]>,
    };

    const callbackMock = vi.fn();
    const result = await createTriggerTaskAction.handler(
      runtimePartial as IAgentRuntime,
      makeMessage("run once at noon"),
      undefined,
      undefined,
      callbackMock,
    );
    expect(result?.success).toBe(true);
    expect(result?.text).toContain("once at 2025-01-01T12:00:00Z");
  });

  test("creates 'cron' trigger properly", async () => {
    useModelMock.mockResolvedValueOnce(
      [
        "<response>",
        "<triggerType>cron</triggerType>",
        "<cronExpression>0 12 * * *</cronExpression>",
        "</response>",
      ].join("\n"),
    );
    getTasksMock.mockResolvedValueOnce([]);

    createTaskMock.mockResolvedValueOnce(
      "00000000-0000-0000-0000-000000000777" as UUID,
    );
    const runtimePartial: Partial<IAgentRuntime> = {
      ...runtime,
      getTask: async () =>
        ({
          id: "00000000-0000-0000-0000-000000000777" as UUID,
          metadata: {
            trigger: {
              triggerId: "00000000-0000-0000-0000-000000000778" as UUID,
              triggerType: "cron",
              cronExpression: "0 12 * * *",
              enabled: true,
            },
          },
        }) as unknown as Parameters<Parameters<IAgentRuntime["getTasks"]>[0]>,
    };

    const callbackMock = vi.fn();
    const result = await createTriggerTaskAction.handler(
      runtimePartial as IAgentRuntime,
      makeMessage("run every day at noon"),
      undefined,
      undefined,
      callbackMock,
    );
    expect(result?.success).toBe(true);
    expect(result?.text).toContain("on cron 0 12 * * *");
  });

  test("handles deriveTriggerType falling back to interval", async () => {
    useModelMock.mockResolvedValueOnce(
      [
        "<response>",
        "<triggerType>unknown</triggerType>",
        "<intervalMs>180000</intervalMs>",
        "</response>",
      ].join("\n"),
    );
    getTasksMock.mockResolvedValueOnce([]);
    const result = await createTriggerTaskAction.handler(
      runtime,
      makeMessage("run an unknown trigger"),
    );
    expect(result?.success).toBe(true);
    expect(result?.data?.triggerType).toBe("interval");
  });

  test("handles deriveTriggerType falling back to cron when expression provided", async () => {
    useModelMock.mockResolvedValueOnce(
      [
        "<response>",
        "<cronExpression>0 12 * * *</cronExpression>",
        "</response>",
      ].join("\n"),
    );
    getTasksMock.mockResolvedValueOnce([]);
    const result = await createTriggerTaskAction.handler(
      runtime,
      makeMessage("run an unknown trigger"),
    );
    expect(result?.success).toBe(true);
    expect(result?.data?.triggerType).toBe("cron");
  });

  test("handles deriveTriggerType falling back to once when scheduledAtIso provided", async () => {
    useModelMock.mockResolvedValueOnce(
      [
        "<response>",
        "<scheduledAtIso>2025-01-01T12:00:00Z</scheduledAtIso>",
        "</response>",
      ].join("\n"),
    );
    getTasksMock.mockResolvedValueOnce([]);
    const result = await createTriggerTaskAction.handler(
      runtime,
      makeMessage("run an unknown trigger"),
    );
    expect(result?.success).toBe(true);
    expect(result?.data?.triggerType).toBe("once");
  });

  test("handles failing to build trigger metadata", async () => {
    useModelMock.mockResolvedValueOnce(
      [
        "<response>",
        "<triggerType>cron</triggerType>",
        "<cronExpression>invalid cron</cronExpression>",
        "</response>",
      ].join("\n"),
    );
    getTasksMock.mockResolvedValueOnce([]);
    const result = await createTriggerTaskAction.handler(
      runtime,
      makeMessage("run invalid cron"),
    );
    expect(result?.success).toBe(false);
    // building trigger metadata throws from invalid cron expression
    expect(result?.text).toContain("cronExpression must be a valid");
  });

  test("handles getTask returning null", async () => {
    const runtimePartial: Partial<IAgentRuntime> = {
      ...runtime,
      getTask: async () => null,
    };
    const result = await createTriggerTaskAction.handler(
      runtimePartial as IAgentRuntime,
      makeMessage("create a trigger"),
    );
    expect(result?.success).toBe(true);
    expect(result?.text).toContain("scheduled");
  });
});
