## 2024-05-18 - Missing ARIA Labels on Close Buttons
**Learning:** Found several modal and overlay components (like `MediaGalleryView.tsx`, `SkillsView.tsx`, `DatabaseView.tsx`, `ChatView.tsx`, `ConversationsSidebar.tsx`) using `&times;` or `×` for close buttons without an `aria-label`.
**Action:** When implementing close buttons using visual characters instead of icons, always include `aria-label="Close"` and wrap the text element in `<span aria-hidden="true">` to ensure screen readers announce "Close" instead of "Times".
