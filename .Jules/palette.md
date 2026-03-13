## 2026-03-13 - Add aria-labels to symbol-only icon buttons
**Learning:** Decorative symbols like '×' used in icon-only delete buttons are read aloud awkwardly or redundantly by screen readers.
**Action:** Always add an explicit `aria-label` to icon-only interactive elements and wrap visual-only symbols/icons inside a `<span aria-hidden="true">`.
