## 2025-04-26 - React list rendering performance optimization
**Learning:** Creating `new Date()` instances for sorting operations in React list renders causes significant overhead (O(n log n) object allocations), especially if the list changes frequently or is large. Also, doing this computation synchronously on every render wastes CPU cycles.
**Action:** Use `localeCompare` for lexicographical string comparison of ISO 8601 timestamps and wrap the sorting logic in `useMemo` to prevent unnecessary allocations and redundant calculations.
