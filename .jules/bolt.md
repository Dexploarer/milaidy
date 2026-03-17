## 2024-05-18 - Faster Date Sorting
**Learning:** In the `apps/app` frontend React code, parsing dates from strings within large array sorts (e.g., sorting `conversations` by `updatedAt` on every render) is a performance bottleneck. `new Date(dateString).getTime()` has a surprisingly high cost because it creates a new Date object instantiation on every iteration just to retrieve the epoch timestamp.
**Action:** Use `Date.parse(dateString)` for simple timestamp derivation instead. It avoids object instantiation entirely and yields identical primitive integers, optimizing re-render speeds.
