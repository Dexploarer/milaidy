## 2026-02-25 - Icon-Only Button Accessibility
**Learning:** Icon-only buttons (like delete '×') lack context for screen readers. Using `title` is insufficient. The visual symbol '×' can be announced confusingly.
**Action:** Always add `aria-label` to the button and wrap the visual icon/text in `<span aria-hidden="true">` to ensure clean announcement.
