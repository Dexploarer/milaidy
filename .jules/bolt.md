## 2024-03-31 - Memoizing Derived State

**Learning:** When derived state requires looping or sorting (e.g. `[...array].sort()`), doing it directly inside the functional component body executes O(N log N) work on *every* single re-render, which is a significant performance bottleneck if the array is large and the component updates frequently (e.g., from an active text input like `editingTitle` in `ConversationsSidebar`).
**Action:** Always wrap expensive derived calculations (especially those using cloning and sorting of large lists) with `useMemo`, depending on the minimal set of dependencies (like the base array). This avoids unnecessary re-evaluation and keeps UI interaction smooth.
