
## 2025-03-15 - ARIA Labels on Icon-only Buttons
**Learning:** Icon-only buttons (like ChatView or ConversationsSidebar) require an `aria-label` on the button itself. Visual content (like SVGs or HTML entities like `&times;` or characters like `×`) must be wrapped in `aria-hidden="true"`. Hiding visual text without ensuring a parent `aria-label` exists causes a major accessibility regression by making the button completely invisible to screen readers.
**Action:** Always ensure any icon-only button uses `aria-label` on the button tag, and uses `aria-hidden="true"` on the enclosed text or icon content to prevent redundant screen reader announcements while maintaining accessibility.
