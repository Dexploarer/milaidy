## 2024-05-24 - Hiding Visual Text in Icon-Only Buttons
**Learning:** Visual content (such as text characters like '×' or HTML entities like `&times;`) inside icon-only buttons can be read aloud by screen readers, creating confusing and redundant announcements if the parent button already has a descriptive `aria-label`.
**Action:** Always wrap visual text characters in `<span aria-hidden="true">` when used inside icon-only buttons to ensure they remain decorative, while relying on the parent button's `aria-label` for accessibility.
