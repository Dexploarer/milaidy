## 2025-02-28 - Parallelize DB Calls in Agent Export
**Learning:** `db.getComponents` inside `agent-export.ts` is called in an N+1 loop for every entity and world, creating sequential I/O delays during agent export.
**Action:** Use `Promise.all` to parallelize database fetching queries inside loops across different entities and components to optimize I/O limits.
