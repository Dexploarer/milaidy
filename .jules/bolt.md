## 2024-03-20 - Date Parsing Optimization for Sort
**Learning:** React re-renders causing array sorting with `new Date(dateString).getTime()` results in expensive object allocation and N+1 garbage collection overhead in hot paths like lists and chat sidebars.
**Action:** Use `Date.parse(dateString)` for sorting time-strings to prevent allocations, and aggressively memoize complex derived state (like `sortedConversations`) with `useMemo` so it's not needlessly re-calculated (O(N*logN)) on each tick.
