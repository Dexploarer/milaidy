## 2026-04-24 - Memoizing expensive list sorting in React
**Learning:** Parsing Dates inside a sort function during every render cycle scales poorly as list size grows (O(n log n) operations where n is the number of conversations).
**Action:** Always wrap list sorting operations, especially those involving Date parsing or string conversions, in a `useMemo` hook to prevent redundant calculations on unaffected state updates.
