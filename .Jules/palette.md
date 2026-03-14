## 2024-03-14 - Icon-Only Button Readouts
**Learning:** Raw text characters like `×` and `&times;`, and visual SVGs in icon-only buttons create redundant or confusing readouts for screen readers when not explicitly hidden (even if the parent button has an `aria-label`).
**Action:** Always wrap visual elements in `<span aria-hidden="true">` or add `aria-hidden="true"` to SVGs inside icon-only buttons to prevent double announcement.
