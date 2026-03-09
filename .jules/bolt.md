## 2024-05-24 - React Component Expensive Computations
**Learning:** `useApp` is a context hook that triggers frequent re-renders across consuming components. Expensive operations like array sorting with Date parsing in `ConversationsSidebar.tsx` will be executed repeatedly, potentially causing performance degradation.
**Action:** Aggressively memoize expensive operations (like sorting or mapping with date operations) inside components consuming context like `useApp` using `useMemo`.
