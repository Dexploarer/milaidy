## 2024-11-20 - Caching Promises for Concurrent Initializations
**Learning:** When optimizing async checks like `detectPackageManager` using module-level caching, caching the `Promise` itself rather than the resolved value is critical. This prevents redundant concurrent system calls before the first promise resolves.
**Action:** When adding memoization for slow, initial system or OS level calls, cache the executing Promise immediately instead of waiting to store the final result.
