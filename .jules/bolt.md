## 2024-05-15 - React Component Render Optimization
**Learning:** React component renders involving frequent date-based sorting (e.g., arrays affected by `useApp()` context updates) can suffer performance bottlenecks when using `new Date(dateString).getTime()`. This creates expensive object allocation and increases garbage collection overhead, making rendering sluggish as array size grows.
**Action:** Prefer `Date.parse(dateString)` over `new Date(dateString).getTime()` to avoid expensive object allocation, and wrap such operations in `useMemo` to prevent O(N*logN) re-sorts on every render.
