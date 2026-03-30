## 2024-03-30 - Prevent unnecessary sorting of conversations
**Learning:** In the ConversationsSidebar component, sorting a list of conversations on every render can lead to unnecessary computation, especially as the list grows. React components re-render often, and expensive operations like sorting should be memoized.
**Action:** Use `useMemo` to cache the sorted conversations array, only re-evaluating when the `conversations` dependency changes.
