## 2026-04-30 - Optimize React List Rendering Timestamp Sorting
**Learning:** Using new Date() allocations inside array sorts within React components leads to unnecessary memory allocation and performance overhead on every re-render.
**Action:** Always memoize derived lists that require sorting and prefer raw string comparisons (e.g., b.updatedAt > a.updatedAt) for ISO 8601 timestamp fields over allocating Date objects.
