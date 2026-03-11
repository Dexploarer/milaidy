
## 2024-03-11 - Date.parse overhead and React render tracking
**Learning:** `new Date().getTime()` carries significant overhead inside `sort` functions that get re-evaluated on every render (due to the `useApp` context triggering frequent re-renders). `Date.parse()` is measurably faster as it bypasses the object instantiation.
**Action:** Always prefer `Date.parse()` over `new Date().getTime()` in sort or map functions within React components, and ensure sorting large arrays from context is memoized with `useMemo` to prevent parsing strings on every render.
