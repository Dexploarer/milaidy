## 2025-02-14 - Expensive sorting in render body
**Learning:** `useApp()` is consumed in many components (like `ConversationsSidebar.tsx`), causing frequent re-renders when global state or local state (e.g. `typing` into an input field) changes. Doing `.sort()` with `new Date()` parsing on every render causes a significant performance drop during these updates.
**Action:** Always wrap expensive operations (especially array sorting and date parsing) inside `useApp()` consumers with `useMemo`, with strict dependency arrays to avoid redundant recalculations on unrelated state changes.
