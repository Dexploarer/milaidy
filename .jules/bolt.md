## 2025-04-09 - Cache Package Manager Detection System Calls
**Learning:** Checking for `bun` or `npm` using `execFileAsync` takes ~7ms per call and is repeated dozens of times during plugin installations. Uncached, 50 concurrent checks take ~370ms. By caching the `Promise` itself rather than the resolved value, we eliminate redundant concurrent system calls entirely while avoiding race conditions introduced by `Promise.any`.
**Action:** Always cache the `Promise` when optimizing repeated, expensive async OS operations, and expose an `_internalClear*` function to maintain unit test isolation.
