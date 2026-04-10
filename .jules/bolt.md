## 2024-04-10 - Cache async system calls for detecting package managers
**Learning:** Calling `detectPackageManager()` repeatedly executing `bun --version` or `npm --version` over a Promise takes time. Instead of repeatedly checking it, caching the Promise object avoids redundantly triggering the system call while the first call is still resolving.
**Action:** Expose an internal helper `_internalClearPackageManagerCache()` to clear state between tests so that they continue to run hermetically and avoid test leakage. Cache the promise itself to handle concurrent invocations safely.
