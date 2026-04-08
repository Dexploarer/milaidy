import { detectPackageManager } from "./src/services/plugin-installer.ts";

async function run() {
  const start = performance.now();
  for (let i = 0; i < 100; i++) {
    await detectPackageManager();
  }
  const end = performance.now();
  console.log(`Time: ${end - start}ms`);
}

run();
