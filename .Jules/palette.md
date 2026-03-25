## 2024-03-25 - Icon-only buttons with text characters
**Learning:** Icon-only buttons that use text characters like '×' or '&times;' need `<span aria-hidden="true">` to prevent redundant or confusing screen reader announcements, especially when an `aria-label` is already present or added. Otherwise, screen readers will announce both the label and the character, or just the character which is confusing.
**Action:** Always wrap visual text characters used as icons in `<span aria-hidden="true">` and ensure the parent button has a descriptive `aria-label`.
