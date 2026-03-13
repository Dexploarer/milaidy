## 2024-05-20 - Icon-Only Button Accessibility in Conversations
**Learning:** In the sidebar and chat components, icon-only buttons with text characters like '×' or '&times;' are read aloud by screen readers confusingly (e.g., as "times" or "multiplication X") even if an aria-label is present on the button.
**Action:** Always wrap visual text characters and HTML entities in a `<span aria-hidden="true">` when they are used as icons inside buttons, and ensure the button itself has a descriptive `aria-label` (e.g., "Delete conversation [Title]").
