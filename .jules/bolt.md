## 2025-04-29 - O(n log n) overhead in localeCompare for ISO dates
**Learning:** `localeCompare` is heavily used across the codebase for sorting simple ISO timestamp strings (e.g., `createdAt`), which incurs a significant and unnecessary O(n log n) performance hit compared to raw string comparison.
**Action:** When sorting standard ISO 8601 strings, always replace `localeCompare` with raw comparison (`b > a ? 1 : b < a ? -1 : 0`). Additionally, ensure derived filtered lists in React are wrapped in `useMemo` to avoid redundant O(n) filtering on re-renders.
