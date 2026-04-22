## 2025-04-22 - Missing ARIA labels on specific action buttons
**Learning:** Many custom UI components implement 'x' buttons (using the "×" character) for closing dialogs or deleting items, but they lack `aria-label` attributes, making them inaccessible to screen reader users (screen readers might read "times" or "multiply" instead of their intended actions).
**Action:** Always verify that icon-only buttons, especially those using symbols like "×", have explicit `aria-label` attributes to ensure they are accessible.
