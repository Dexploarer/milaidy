## 2024-05-19 - Accessible Close Buttons for Modals and Thumbnails
**Learning:** When using common textual characters like "×" (multiplication sign) or HTML entities like `&times;` to represent "Close" or "Remove", screen readers will literally announce them as "times" or "multiplication", creating a confusing user experience.
**Action:** Always wrap visual text icons in `<span aria-hidden="true">` and ensure the parent `<button>` has a clear, descriptive `aria-label` (e.g., `aria-label="Remove image"` or `aria-label="Delete conversation"`).
