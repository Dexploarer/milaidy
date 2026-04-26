## 2024-05-18 - Missing ARIA label for conversational sidebar delete action
**Learning:** Found an icon-only button ("×") representing delete in the `ConversationsSidebar` that relied solely on the `title` attribute for accessibility. The `title` attribute is often insufficient for screen readers or when hovered.
**Action:** Always add explicit `aria-label` to icon-only buttons to guarantee screen reader accessibility.
