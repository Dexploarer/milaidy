## 2024-03-28 - Date string parsing overhead in React renders
**Learning:** Instantiating `new Date(dateString).getTime()` in React components during sorts creates a significant memory and garbage collection overhead compared to `Date.parse(dateString)`, which skips object allocation.
**Action:** Always prefer `Date.parse()` over `new Date().getTime()` for date string comparison, and wrap expensive derived state operations like `Array.sort()` in `useMemo` to prevent O(N*logN) recalculations on every render.
