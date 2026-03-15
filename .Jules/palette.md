## 2026-03-15 - Hide visual text for icon-only buttons
**Learning:** Visual text characters like '×' or HTML entities like '&times;' must be wrapped in 'aria-hidden="true"' when the parent button already has an 'aria-label' to prevent redundant screen reader announcements.
**Action:** Always wrap non-semantic visual indicators inside buttons with aria-hidden when an accessible label is provided.
