## 2024-05-18 - Tooltip ARIA expansions in Modal Forms
**Learning:** Expanding collapsibles without linked `aria-expanded` and `aria-controls` states breaks contextual navigation for screen readers when handling complex log textareas. `role="alert"` ensures screen readers vocalize validation errors injected dynamically.
**Action:** Always link toggles for detailed views (like logs) to their respective content areas via `aria-expanded` and `aria-controls` IDs, and attach `role="alert"` to dynamically rendered warning divs.
