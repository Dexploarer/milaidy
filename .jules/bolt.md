## 2025-02-19 - Date Parsing Object Allocation Bottleneck
**Learning:** React component renders involving frequent date-based sorting (e.g., arrays affected by `useApp()` context updates) suffer from excessive object allocation and garbage collection overhead when using `new Date(dateString).getTime()`.
**Action:** Always prefer `Date.parse(dateString)` for pure timestamp comparisons to prevent unnecessary Date object instantiation, and ensure array sorts inside React components are wrapped in `useMemo` to prevent O(N*logN) re-sorts on every render.
