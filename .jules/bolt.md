## 2025-04-28 - Optimize React list sorting
**Learning:** For optimal performance in React list rendering, prefer lexicographical string comparison (e.g., `b.updatedAt.localeCompare(a.updatedAt)`) over `new Date()` allocation when sorting by ISO 8601 timestamps, and always memoize the derived list to prevent O(n log n) object allocation overhead on re-renders.
**Action:** Always memoize derived lists and avoid `new Date()` object allocation in sorting functions for ISO 8601 strings.
