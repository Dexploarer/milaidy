## 2024-03-19 - Screen Reader Announcements on Icon-only Buttons
**Learning:** Visual text characters (like '×' or '&times;') inside icon-only buttons with `aria-label` are read aloud by screen readers, causing redundant or confusing announcements.
**Action:** Always wrap visual text characters in `<span aria-hidden="true">` when the parent button already has a descriptive `aria-label`.
