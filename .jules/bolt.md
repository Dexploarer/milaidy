## 2025-04-09 - Caching detectPackageManager

**Learning:** When caching asynchronous performance bottlenecks (like slow system OS calls via `execFileAsync`), caching the `Promise` itself instead of the resolved value prevents concurrent invocations from redundantly triggering the expensive operation before the first promise resolves.
**Action:** Always cache the promise of the async operation to avoid concurrent, redundant system calls.
