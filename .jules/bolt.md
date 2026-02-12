## 2024-05-22 - [Parallel DB Fetching for Agent Export]
**Learning:** Significant performance gains (4x) achieved by parallelizing independent DB queries in `extractAgentData`. The original sequential implementation was dominated by DB latency. Using `Promise.all` effectively hides this latency.
**Action:** Always look for opportunities to parallelize independent async operations, especially when dealing with multiple database tables or entities.
