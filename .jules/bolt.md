## 2026-02-14 - Agent Export Optimization
**Learning:** The `agent-export.ts` service was sequentially querying memory tables, which could be a bottleneck. Parallelizing these queries using `Promise.all` works correctly with the database adapter and significantly reduces the total time spent waiting for I/O.
**Action:** Always check for sequential database queries in loops, especially when iterating over a fixed set of tables or entities, and consider parallelizing them with `Promise.all`.
