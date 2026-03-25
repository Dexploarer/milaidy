
## 2025-03-24 - [Avoid Date object creation for sorting]
**Learning:** React components that frequently re-sort lists of dates (like conversation lists using `useApp` contexts) trigger O(N) `new Date(string)` instantiations. This forces expensive object allocation and subsequent garbage collection on every render, which is an anti-pattern when we only need the numeric timestamp.
**Action:** Always prefer `Date.parse(dateString)` instead of `new Date(dateString).getTime()` for calculating sorting values. Wrap such expensive re-sort operations in `useMemo` so that they do not run continuously on component renders.
