## 2024-03-15 - Date Parsing Performance in Re-renders
**Learning:** `new Date(dateString).getTime()` is surprisingly expensive in React components that re-render frequently (like those consuming the unstable `useApp()` context hook).
**Action:** Replace `new Date(dateString).getTime()` with `Date.parse(dateString)` for sorting or timestamp comparisons, and wrap expensive array sorting operations in `useMemo` to prevent recalculation on every minor state change.
