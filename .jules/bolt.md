## 2025-01-01 - Caching Promises for System Calls
**Learning:** Caching the Promise itself rather than the resolved value for asynchronous system calls (like `execFileAsync` when detecting package managers) prevents redundant concurrent executions and avoids race conditions.
**Action:** Apply Promise-level caching for expensive async operations to avoid redundant OS overhead.
