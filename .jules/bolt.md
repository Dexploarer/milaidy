## 2025-02-20 - Optimize React rendering with Date.parse and useMemo
**Learning:** Frequent date-based sorting during React renders incurs unnecessary overhead when using new Date().getTime() due to object allocation.
**Action:** Prefer Date.parse() to evaluate timestamps without object instantiation and wrap expensive sorting in useMemo when applicable to prevent O(N*logN) re-sorts.
