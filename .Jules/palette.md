
## 2024-05-15 - Icon-only buttons Accessibility
**Learning:** Icon-only buttons using text characters like '×' or '&times;' without an explicit `aria-label` on the button and `aria-hidden="true"` on the content create poor screen reader experiences.
**Action:** Always ensure that visual content inside an icon-only button is hidden with `<span aria-hidden="true">` when it acts solely as a visual representation, and provide a clear `aria-label` on the parent `<button>` element.
