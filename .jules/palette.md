## 2025-02-13 - Hide visual decorative text characters from screen readers
**Learning:** Icon-only buttons often use raw text characters (like `×` or `&times;`) for visual representation. If a screen reader reads both the `aria-label` and the raw text character, it creates redundant or confusing announcements (e.g., "Close chats panel, times").
**Action:** When adding `aria-label`s to icon-only buttons that use raw text characters or SVGs, always wrap the visual content in `<span aria-hidden="true">` or add `aria-hidden="true"` to the element to ensure a clean, accessible experience.
