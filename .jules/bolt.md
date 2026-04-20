## 2025-04-20 - Parallelize N+1 memory queries
**Learning:** The `IDatabaseAdapter` interface lacks bulk fetching methods for agent memories across multiple tables, leading to an I/O-bound N+1 query pattern when looping sequentially through `MEMORY_TABLES` (e.g., in `extractAgentData` and `estimateExportSize`).
**Action:** When bulk fetching methods are unavailable in the adapter interface, the standard performance optimization is to parallelize the sequential `await` calls using `Promise.all` to significantly reduce database query latency.
