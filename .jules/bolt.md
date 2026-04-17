## 2024-04-16 - Initial Setup
**Learning:** Initializing bolt journal.
**Action:** Use this file to record critical codebase-specific performance learnings.
## 2024-04-17 - React Sidebar Render Optimization
**Learning:** `new Date(string).getTime()` in a `.sort()` block that runs every render in `ConversationsSidebar` causes significant unnecessary CPU time, particularly on frequent re-renders like typing in a chat sidebar filter or navigating.
**Action:** Use `useMemo` for expensive sorts derived from React context values and avoid repeated parsing of ISO date strings in sorts. ISO-8601 string lengths and formats guarantee chronological ordering via string comparison `a > b ? -1 : a < b ? 1 : 0`.
