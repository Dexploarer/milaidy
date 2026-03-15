## 2024-05-19 - Avoid `new Date().getTime()` in React Renders
**Learning:** Instantiating `new Date(val).getTime()` inside loops (like `Array.prototype.sort`) or directly within React render bodies causes unnecessary memory allocation and garbage collection overhead.
**Action:** Always prefer `Date.parse(val)` when only the numeric timestamp is needed for comparison, and ensure expensive sorting operations derived from context are memoized with `useMemo` to prevent re-execution on unrelated state changes.
