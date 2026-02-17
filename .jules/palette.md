## 2026-02-17 - Keyboard Accessible Tooltips
**Learning:** Tooltips implemented with hover-only CSS (`.wrapper:hover .tooltip`) are inaccessible to keyboard users. This pattern was found in the header wallet component.
**Action:** When implementing tooltips, always add focus states alongside hover states using Tailwind's `group` on the wrapper and `group-focus-within:block` on the tooltip to ensure keyboard accessibility.
