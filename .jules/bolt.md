
## 2025-02-19 - Fast Date Sorting in React
**Learning:** Re-rendering components that sort date arrays using `new Date(dateStr).getTime()` creates expensive object allocations inside `O(N*logN)` operations, triggering frequent garbage collection on every render in components like `ConversationsSidebar`.
**Action:** Always wrap date-based sorting arrays in `useMemo` in React components, and replace `new Date(dateStr).getTime()` with `Date.parse(dateStr)` to eliminate intermediate object allocations.
