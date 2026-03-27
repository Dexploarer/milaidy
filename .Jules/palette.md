## 2025-03-27 - Icon-only buttons lacking proper aria attributes
**Learning:** Found multiple instances where close buttons using `&times;` lack `aria-label` on the parent button and `<span aria-hidden="true">` around the character. This causes major screen reader confusion.
**Action:** Always verify icon-only buttons have an `aria-label` and hide visual icon characters from screen readers using `aria-hidden="true"`.
