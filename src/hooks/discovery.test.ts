import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { discoverHooks } from "./discovery";

// Mock logger
vi.mock("@elizaos/core", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

const TEMP_DIR = join(process.cwd(), "temp-hooks-test");

describe("Hooks Discovery", () => {
  beforeAll(async () => {
    await rm(TEMP_DIR, { recursive: true, force: true });
    await mkdir(TEMP_DIR, { recursive: true });
  });

  afterAll(async () => {
    await rm(TEMP_DIR, { recursive: true, force: true });
  });

  beforeEach(async () => {
    // Clean up inside temp dir
    await rm(TEMP_DIR, { recursive: true, force: true });
    await mkdir(TEMP_DIR, { recursive: true });
  });

  it("should return empty array for empty directory", async () => {
    const hooks = await discoverHooks({ extraDirs: [TEMP_DIR] });
    expect(hooks).toEqual([]);
  });

  it("should discover a valid hook", async () => {
    const hookDir = join(TEMP_DIR, "valid-hook");
    await mkdir(hookDir);
    await writeFile(
      join(hookDir, "HOOK.md"),
      `---
name: valid-hook
description: A valid hook
---
`,
    );
    await writeFile(
      join(hookDir, "handler.ts"),
      `export default async () => {}`,
    );

    const hooks = await discoverHooks({ extraDirs: [TEMP_DIR] });
    expect(hooks).toHaveLength(1);
    expect(hooks[0].hook.name).toBe("valid-hook");
    expect(hooks[0].hook.description).toBe("A valid hook");
  });

  it("should ignore hooks without HOOK.md", async () => {
    const hookDir = join(TEMP_DIR, "no-hook-md");
    await mkdir(hookDir);
    await writeFile(
      join(hookDir, "handler.ts"),
      `export default async () => {}`,
    );

    const hooks = await discoverHooks({ extraDirs: [TEMP_DIR] });
    expect(hooks).toHaveLength(0);
  });

  it("should ignore hooks without handler", async () => {
    const hookDir = join(TEMP_DIR, "no-handler");
    await mkdir(hookDir);
    await writeFile(
      join(hookDir, "HOOK.md"),
      `---
name: no-handler
description: Hook with no handler
---
`,
    );

    const hooks = await discoverHooks({ extraDirs: [TEMP_DIR] });
    expect(hooks).toHaveLength(0);
  });

  it("should ignore hooks with invalid frontmatter", async () => {
    const hookDir = join(TEMP_DIR, "invalid-fm");
    await mkdir(hookDir);
    await writeFile(join(hookDir, "HOOK.md"), `INVALID FRONTMATTER`);
    await writeFile(
      join(hookDir, "handler.ts"),
      `export default async () => {}`,
    );

    const hooks = await discoverHooks({ extraDirs: [TEMP_DIR] });
    expect(hooks).toHaveLength(0);
  });

  it("should handle mixed valid and invalid hooks", async () => {
    // Valid hook
    const validDir = join(TEMP_DIR, "valid");
    await mkdir(validDir);
    await writeFile(
      join(validDir, "HOOK.md"),
      "---\nname: valid\ndescription: valid\n---\n",
    );
    await writeFile(join(validDir, "handler.ts"), "");

    // Invalid hook (no handler)
    const invalidDir = join(TEMP_DIR, "invalid");
    await mkdir(invalidDir);
    await writeFile(
      join(invalidDir, "HOOK.md"),
      "---\nname: invalid\ndescription: invalid\n---\n",
    );

    const hooks = await discoverHooks({ extraDirs: [TEMP_DIR] });
    expect(hooks).toHaveLength(1);
    expect(hooks[0].hook.name).toBe("valid");
  });
});
