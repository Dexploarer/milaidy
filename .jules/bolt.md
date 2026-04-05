## 2024-04-05 - Cache asynchronous shell execution results as Promises
**Learning:** When optimizing repetitive shell commands (e.g., detecting the package manager with `execFileAsync`), concurrent invocations may trigger the system call redundantly before the first call finishes.
**Action:** Store the Promise itself in the module cache rather than waiting to cache the resolved value, effectively locking concurrent execution down to a single actual command execution. Remember to expose an internal clearer method `_internalClearPackageManagerCache` for proper unit test isolation.
