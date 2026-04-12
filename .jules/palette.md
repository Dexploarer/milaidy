## 2025-04-12 - List Item Hover Actions Keyboard Accessibility
**Learning:** In this app's list components (like ConversationsSidebar), secondary actions are often hidden by default on desktop using `sm:opacity-0 sm:group-hover:opacity-100`. This breaks keyboard navigation as focused elements remain invisible.
**Action:** Whenever implementing or fixing hover-revealed actions in lists, always add `focus:opacity-100 focus-visible:ring-2` alongside the hover utility classes to ensure keyboard navigability.
