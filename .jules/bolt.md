## 2024-04-08 - Caching Async Package Manager Detection
**Learning:** When optimizing `detectPackageManager` in `src/services/plugin-installer.ts` (or similar async checks) using module-level caching, cache the `Promise` itself rather than the resolved value. This prevents redundant system calls from concurrent executions before the first check resolves.
**Action:** Always cache the promise in async detection routines and expose an `_internalClearPackageManagerCache` for testing to prevent state leakage.
