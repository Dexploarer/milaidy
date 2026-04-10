## 2025-04-10 - Missing ARIA labels on "times" close buttons
**Learning:** Many modals and panels throughout the app use `&times;` (×) for close/delete buttons without an `aria-label`. This causes screen readers to read "multiply" or "times" instead of "Close" or "Remove", confusing users.
**Action:** Always add `aria-label="Close"` or similar context-appropriate labels to icon-only buttons using literal text characters like `&times;` for screen reader accessibility.
