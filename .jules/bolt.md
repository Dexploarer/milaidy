## 2024-06-03 - Memoizing ISO date sorting
**Learning:** In React list components, `Array.sort()` with `new Date()` allocations is incredibly expensive (~10x slower than string comparison) on re-renders. `useMemo` combined with `localeCompare` on ISO date strings prevents this bottleneck.
**Action:** Always memoize derived lists and prefer lexicographical string comparisons over `Date` parsing for ISO 8601 timestamps.
