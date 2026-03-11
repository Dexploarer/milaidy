## 2026-03-11 - Hide Textual Icons from Screen Readers
**Learning:** Textual icons used in icon-only buttons (like "×" or "&times;") are still read by screen readers even if the parent `<button>` has an `aria-label`. This causes redundant or confusing announcements (e.g., "Remove image ×").
**Action:** Always wrap visual textual icons in `<span aria-hidden="true">` to ensure screen readers only announce the `aria-label` of the parent button.
