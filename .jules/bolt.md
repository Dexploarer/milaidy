## 2024-04-06 - Caching Promises for Concurrent System Calls
**Learning:** When multiple operations execute concurrently and require the same slow asynchronous system check (like detecting the package manager via `execFileAsync`), caching the resolved value isn't enough because concurrent calls will still spawn redundant processes before the first check completes.
**Action:** Cache the `Promise` itself rather than the resolved value so concurrent executions await the same pending operation, eliminating redundant system overhead.
