
## 2024-03-27 - Fast Date Sorting in React
**Learning:** Instantiating `new Date(dateString).getTime()` inside loops (especially React `.sort()` functions called on every render) triggers expensive object allocation and heavy garbage collection overhead.
**Action:** Always prefer `Date.parse(dateString)` for sorting or timestamp comparisons, and wrap frequent sorts (like conversation lists) in `useMemo` to prevent O(N*logN) recalculations on unrelated context updates.
