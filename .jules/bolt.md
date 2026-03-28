## 2024-05-15 - Optimize date parsing and sorting in React
**Learning:** In React components that sort arrays based on dates, using `new Date().getTime()` inside a sort comparator creates excessive object allocations and GC overhead, particularly when it runs on every render.
**Action:** Always wrap array sorting in `useMemo` when it depends on context or props, and use `Date.parse(dateString)` for a faster, allocation-free alternative to `new Date().getTime()`.
