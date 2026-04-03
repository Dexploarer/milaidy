## 2024-04-03 - Memoize system process calls in detectPackageManager
**Learning:** Calling `execFileAsync` for shell commands like checking package manager versions can be incredibly slow and blocks the Node event loop if called frequently across multiple files or loops, especially during intensive operations like plugin installations.
**Action:** Always implement module-level caching/memoization for environment checks (`detectPackageManager`), and expose an internal method (`_internalClearPackageManagerCache`) to prevent state leakage in tests.
