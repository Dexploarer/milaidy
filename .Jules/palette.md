## 2024-05-22 - Tooltip Accessibility
**Learning:** Tooltips relying on `:hover` are completely inaccessible to keyboard users. Using `:focus-within` on the parent wrapper is a clean CSS-only fix that makes them accessible without complex JavaScript.
**Action:** Always include `:focus-within` alongside `:hover` for tooltip visibility triggers.
