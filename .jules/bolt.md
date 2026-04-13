## 2025-04-13 - Cached detectPackageManager check

**Learning:** `detectPackageManager` was doing an async `execFileAsync("bun", ["--version"])` call every single time it was called (e.g. for every plugin installation/resolution), which blocks I/O unnecessarily since the package manager installed on the system doesn't change during process execution. Caching the resolved promise prevents repeated exec calls and speeds up multiple installations, without making `Promise.any` race condition which would break the bun/npm fallback order.

**Action:** When creating async system detection helpers that don't change state within the process, cache the `Promise` to avoid redundant external process execution. Expose `_internalClearX` helper for unit tests isolation if the cached value persists across test executions.
