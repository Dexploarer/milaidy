## 2024-05-24 - Unnecessary sorting on every render
**Learning:** `[...array].sort()` inside a React component render function can cause significant performance overhead if the array is large, because it runs on every single render (e.g. keystrokes).
**Action:** Always wrap expensive operations like sorting or mapping large lists inside `useMemo` with appropriate dependency arrays to ensure they only re-compute when the underlying data changes.
