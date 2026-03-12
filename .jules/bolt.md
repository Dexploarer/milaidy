## 2024-05-24 - Optimize Date Parsing in React Renders
**Learning:** The useApp() context hook and component renders in the frontend frequently execute date-based sorting. Using `new Date(dateString).getTime()` creates unnecessary object allocation overhead and parsing overhead during these frequent re-renders.
**Action:** Prefer `Date.parse(dateString)` over `new Date(dateString).getTime()` to reduce parsing and allocation overhead during rapid render cycles or frequent state updates in React.
