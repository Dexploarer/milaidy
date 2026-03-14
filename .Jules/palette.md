## 2024-03-14 - Initialize

## 2024-03-14 - Screen reader announcements for icon-only buttons
**Learning:** Icon-only buttons with visual content like characters ('×') or HTML entities need a parent `aria-label` but also must wrap the visual content in `aria-hidden="true"`. Hiding visual text without ensuring a parent `aria-label` exists causes a major accessibility regression by making the button completely invisible to screen readers.
**Action:** Always verify that an `aria-label` is present on the button element when adding `aria-hidden="true"` to its visual children, to prevent redundant announcements while maintaining accessibility.
