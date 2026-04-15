## 2024-05-14 - Optimize detectPackageManager caching
**Learning:** `detectPackageManager` in `src/services/plugin-installer.ts` is called multiple times and executes child processes (`bun --version`, `npm --version`) synchronously, which can be slow and is N+1 if called frequently.
**Action:** Cache the `Promise` returned by `detectPackageManager` so that concurrent or subsequent calls return immediately without spawning child processes.
