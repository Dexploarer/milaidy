## 2024-10-24 - Array Sorting Performance with useApp() context
**Learning:** Arrays retrieved from `useApp()` (like `conversations`) can trigger O(N*logN) re-sorts on every render if not memoized. Additionally, using `new Date().getTime()` inside sort comparators causes significant GC overhead compared to `Date.parse()`.
**Action:** Always wrap date-based sorts of context arrays in `useMemo`, and prefer `Date.parse(dateString)` over `new Date(dateString).getTime()` to prevent unnecessary object allocation and expensive re-sorts during renders.
