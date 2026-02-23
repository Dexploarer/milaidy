## 2025-02-17 - [Frontend] Prevent Message Re-renders
**Learning:** Extracting large inline lists (like chat messages) into memoized components (`MessageList`, `MessageItem`) significantly reduces re-renders caused by frequent parent state updates (e.g., typing in a controlled input).
**Action:** When working on chat or feed components, always separate the list rendering from the input/control state.
