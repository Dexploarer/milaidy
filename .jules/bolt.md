## 2024-04-10 - Memoize package manager detection
**Learning:** When optimizing async system calls like `detectPackageManager` that use `execFileAsync`, concurrent requests can cause redundant executions before the first check resolves. Caching the resolved value isn't enough; caching the `Promise` itself prevents concurrent invocations.
**Action:** Always cache the `Promise` itself for module-level memoization of expensive asynchronous operations. Remember to expose an `_internalClear*Cache` method to prevent state leakage between unit tests.
