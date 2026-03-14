## 2024-10-24 - Avoid Date parsing in UI sorts
**Learning:** `new Date(string).getTime()` in React render loops or frequent state updates (like WebSockets) causes high object allocation overhead and GC pressure.
**Action:** Use `Date.parse(dateString)` instead of `new Date(dateString).getTime()` for simple numeric timestamp comparisons, and wrap sorted results in `useMemo` where applicable.
