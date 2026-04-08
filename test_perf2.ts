import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

let packageManagerCache: Promise<"bun" | "npm"> | null = null;

export function _internalClearPackageManagerCache(): void {
  packageManagerCache = null;
}

export async function detectPackageManager(): Promise<"bun" | "npm"> {
  if (packageManagerCache) return packageManagerCache;

  packageManagerCache = (async () => {
    for (const cmd of ["bun", "npm"] as const) {
      try {
        await execFileAsync(cmd, ["--version"]);
        return cmd;
      } catch {
        // not available
      }
    }
    return "npm";
  })();

  return packageManagerCache;
}

async function run() {
  const start = performance.now();
  for (let i = 0; i < 100; i++) {
    await detectPackageManager();
  }
  const end = performance.now();
  console.log(`Time: ${end - start}ms`);
}

run();
