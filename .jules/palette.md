## 2025-02-18 - Chat Accessibility Patterns
**Learning:** Chat interfaces in this app often lack semantic structure for screen readers. The `ChatView` component used `div`s for messages without roles.
**Action:** Use `role="log"` with `aria-live="polite"` for the message container and `role="article"` for individual messages to ensure new messages are announced naturally.

## 2025-02-18 - Icon-Only Buttons
**Learning:** Many icon-only buttons rely solely on `title` attributes, which are insufficient for screen reader users.
**Action:** Always add `aria-label` to icon-only buttons and `aria-hidden="true"` to their internal SVGs to reduce noise.
