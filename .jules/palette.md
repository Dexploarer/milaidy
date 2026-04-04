## 2024-04-04 - Accessible Close and Remove Buttons
**Learning:** When using visual indicators like `&times;` or `×` for close/remove/delete buttons, screen readers vocalize "times" or nothing at all, breaking accessibility.
**Action:** Always add explicit `aria-label` attributes to icon-only interactive elements, providing proper vocalization context, even if visual tooltips are missing.
