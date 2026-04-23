## 2024-03-24 - Accessibility improvements for icon-only buttons
**Learning:** Found several icon-only buttons without `aria-label`s, such as the clear, minimize, and close buttons in TerminalPanel, or action buttons in ConversationsSidebar. Screen readers need these to announce what the buttons do.
**Action:** Adding `aria-label` attributes to the buttons in `TerminalPanel` and `ConversationsSidebar` that lack them to improve accessibility.
