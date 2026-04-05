## 2025-04-05 - Cache Promises for Async OS Checks
**Learning:** When optimizing async system OS checks (e.g., `execFileAsync` in `detectPackageManager`), caching the Promise itself rather than the resolved value prevents redundant concurrent executions from triggering the expensive operation before the first promise resolves.
**Action:** Implement Promise-level caching for frequently called, side-effect-free async system checks.
