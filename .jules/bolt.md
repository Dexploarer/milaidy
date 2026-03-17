
## 2024-05-15 - React Component Render Optimization
**Learning:** The `useApp()` context hook in the frontend (e.g., `apps/app/src/AppContext.tsx`) triggers frequent re-renders across consuming components on minor state changes. Expensive operations within components, such as sorting large arrays and parsing date strings via `new Date(dateString).getTime()`, can become performance bottlenecks if executed on every render.
**Action:** Aggressively memoize expensive operations with `useMemo` in components consuming `useApp()`, and prefer `Date.parse(dateString)` over `new Date(dateString).getTime()` to reduce parsing overhead and object allocations during renders.
