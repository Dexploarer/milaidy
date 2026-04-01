## 2025-02-12 - Missing Memoization on Large Lists
**Learning:** Lists rendered in sidebars mapping stateful objects (like conversations) sort and re-render on every keystroke if local state like `editingId` or `editingTitle` changes, unless the sorting itself is memoized.
**Action:** Always wrap `array.sort()` on props or context arrays with `useMemo` in components that also manage local input or focus state to prevent expensive O(n log n) recalculations during unrelated renders.
