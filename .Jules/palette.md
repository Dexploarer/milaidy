## 2025-05-24 - Accessible Tooltips with :focus-within
**Learning:** Tooltips that rely solely on `:hover` exclude keyboard users and touch device users. Using `:focus-within` on the parent container allows the tooltip to remain visible when a user tabs into the trigger button or any interactive elements inside the tooltip (like copy buttons).
**Action:** When creating CSS-only tooltips or dropdowns, always include `.parent:focus-within .child { display: block; }` alongside the hover state to ensure keyboard accessibility.
