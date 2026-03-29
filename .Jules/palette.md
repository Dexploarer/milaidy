## 2024-05-20 - Icon-only Button Accessibility
**Learning:** Icon-only buttons using text characters like '×' or '&times;' without wrapping them in `<span aria-hidden="true">` cause screen readers to announce the character redundantly or confusingly (e.g. "times").
**Action:** Always wrap visual text characters in icon-only buttons with `<span aria-hidden="true">` and ensure the parent `<button>` has a descriptive `aria-label`.
