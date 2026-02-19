# Palette's Journal

This journal records CRITICAL UX and accessibility learnings specific to this project.

Format:
## YYYY-MM-DD - [Title]
**Learning:** [UX/a11y insight]
**Action:** [How to apply next time]

## 2024-05-22 - Keyboard Accessibility in Hover Actions
**Learning:** The application uses `opacity-0 group-hover:opacity-100` for action buttons (like delete), which makes them completely invisible and inaccessible to keyboard users who navigate via Tab.
**Action:** Always add `focus:opacity-100` (or similar focus styles) to elements that are hidden by default but reveal on hover, ensuring keyboard users can see what they are focusing on.
