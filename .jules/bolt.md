## 2025-04-12 - Parallelize Component Fetching
**Learning:** Sequential N+1 database queries can become a significant bottleneck when exporting agents, specifically when fetching components for many entities and worlds via `db.getComponents()`.
**Action:** Use `Promise.all` mapped over the arrays to parallelize these independent I/O-bound database calls, greatly speeding up the export process without changing behavior.
