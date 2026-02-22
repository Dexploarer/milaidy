import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { startApiServer } from "./server";

vi.mock("../config/config", () => ({
  loadMiladyConfig: () => ({
    agents: {
      defaults: { workspace: "/tmp/milady-test" },
      list: [{ name: "TestAgent" }],
    },
    ui: { assistant: { name: "TestAgent" } },
    features: { shellEnabled: false },
  }),
  saveMiladyConfig: vi.fn(),
  configFileExists: () => true,
}));

vi.mock("../services/app-manager", () => ({
  AppManager: class {},
}));

vi.mock("../services/fallback-training-service", () => ({
  FallbackTrainingService: class {
    subscribe() { return () => {}; }
    initialize() { return Promise.resolve(); }
  },
}));

vi.mock("@elizaos/core", async () => {
  return {
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
    AgentRuntime: class {},
    ChannelType: { DM: "dm" },
    ModelType: { TEXT_SMALL: "text-small" },
    stringToUuid: (s) => s,
    createMessageMemory: () => ({}),
  };
});

vi.mock("node:fs", async () => {
  const actual = await vi.importActual("node:fs");
  return {
    ...actual,
    existsSync: () => false,
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    readFileSync: vi.fn(),
    statSync: () => ({ isFile: () => false }),
  };
});

describe("API Server Security Headers", () => {
  let serverPort: number;
  let closeServer: () => Promise<void>;

  beforeAll(async () => {
    process.env.MILADY_API_BIND = "127.0.0.1";
    process.env.MILADY_API_TOKEN = "test-token";

    // Silence logs
    console.log = vi.fn();

    const { port, close } = await startApiServer({ port: 0 });
    serverPort = port;
    closeServer = close;
  });

  afterAll(async () => {
    if (closeServer) await closeServer();
  });

  it("should respond with security headers on valid routes", async () => {
    const res = await fetch(`http://127.0.0.1:${serverPort}/api/config`);
    expect(res.headers.get("X-Frame-Options")).toBe("DENY");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("Referrer-Policy")).toBe("no-referrer");
    expect(res.headers.get("Permissions-Policy")).toBe("interest-cohort=()");
  });

  it("should respond with security headers on 404 routes", async () => {
    const res = await fetch(`http://127.0.0.1:${serverPort}/api/does-not-exist`);
    expect(res.headers.get("X-Frame-Options")).toBe("DENY");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("Referrer-Policy")).toBe("no-referrer");
    expect(res.headers.get("Permissions-Policy")).toBe("interest-cohort=()");
  });
});
