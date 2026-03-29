## 2024-05-24 - Expensive Date Instantiation in Render Loop
**Learning:** Frequent date-based sorting arrays using `new Date(dateString).getTime()` inside React renders allocates objects excessively and triggers garbage collection, causing noticeable performance bottlenecks in lists like the sidebar.
**Action:** Always prefer `Date.parse(dateString)` over `new Date()` for timestamp comparisons, and wrap list sorting operations in `useMemo()` to avoid O(N*logN) re-sorts on every render.
