## 2024-05-14 - Initial Setup
**Learning:** Establishing the journal for performance insights.
**Action:** Use this file to document critical performance patterns, bottlenecks, and surprises specific to this codebase.

## 2024-05-14 - Date parsing performance
**Learning:** `new Date(dateString).getTime()` is used for sorting in `ConversationsSidebar.tsx` on every render.
**Action:** Replace `new Date(dateString).getTime()` with `Date.parse(dateString)` to reduce parsing overhead, and memoize the sorted array to avoid re-sorting on every render when dependencies haven't changed.
