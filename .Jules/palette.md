## 2024-03-22 - Hide text icons from screen readers
**Learning:** Icon-only buttons that use visual text characters like "×" or HTML entities like "&times;" instead of SVGs need those text nodes hidden from screen readers. Otherwise, the screen reader will read the raw text symbol (like "times") along with the `aria-label`, causing a confusing duplicate/literal announcement.
**Action:** Always wrap visual text characters in `<span aria-hidden="true">` inside icon-only buttons, and make sure the parent button has an `aria-label`.
