## 2024-03-28 - Icon-only Button Accessibility
**Learning:** Visual content in icon-only buttons (like '×' or '&times;') without an explicit parent `aria-label` or wrapping in `aria-hidden="true"` causes redundancy or major accessibility regressions by making the button invisible or confusing to screen readers.
**Action:** Always ensure icon-only buttons have an `aria-label` on the parent `<button>` element and that the visual characters/icons inside are explicitly hidden from screen readers using `<span aria-hidden="true">` or `aria-hidden="true"` on SVGs.
