## 2024-05-17 - Date Parsing Optimization
**Learning:** React component renders involving frequent date-based sorting (e.g., arrays affected by `useApp()` context updates) can cause performance bottlenecks when using `new Date(dateString).getTime()`. This leads to expensive object allocation and increases garbage collection overhead, especially when re-sorting lists frequently.
**Action:** Use `Date.parse(dateString)` instead of `new Date(dateString).getTime()` to avoid expensive object allocation. Additionally, wrap such operations in `useMemo` to prevent O(N*logN) re-sorts on every render.
