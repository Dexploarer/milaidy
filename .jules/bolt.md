# Bolt's Performance Learnings
## 2024-05-18 - Promise Caching over Resolved Value Caching for OS Calls
**Learning:** When optimizing asynchronous system-level calls (like `execFile` for version detection), concurrent invocations can trigger multiple identical expensive OS shell operations before the first caching promise resolves.
**Action:** When implementing caching for expensive asynchronous operations that might be called concurrently during initialization, always cache the `Promise` object immediately upon creation rather than waiting to cache the resolved string value.
