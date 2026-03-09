## 2025-03-09 - Missing React.useMemo in ConversationsSidebar
**Learning:** `ConversationsSidebar` does not memoize its `sortedConversations` and invokes a sort on `conversations` every render, which happens frequently as it is connected to `useApp` and re-renders on every state update.
**Action:** Always check frequently re-rendering components connected to global context for expensive operations like sorting. Add `useMemo` for derived states to prevent unnecessary processing.
