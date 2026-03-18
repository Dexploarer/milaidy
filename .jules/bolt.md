## 2024-10-24 - Optimizing Derived State and Date Parsing
**Learning:** Using `new Date().getTime()` inside `.sort()` functions (especially in React components) is inefficient due to multiple object allocations. Also, `useApp()` state changes trigger frequent re-renders in `apps/app`, making unmemoized array sorting a performance bottleneck.
**Action:** Aggressively memoize expensive derived state like sorting with `useMemo` in frontend views, and prefer `Date.parse()` over `new Date().getTime()` to reduce parsing overhead during renders.
