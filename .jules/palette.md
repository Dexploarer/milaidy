## 2025-02-14 - Icon-only buttons need aria-labels
**Learning:** When adding or modifying icon-only interactive elements (e.g., delete buttons using '×' or status confirmation buttons), always add an explicit `aria-label` attribute to provide proper vocalization context for screen reader users, even if a visual `title` attribute is present.
**Action:** Always ensure any interactive element whose only visual content is an icon or short symbol ('×', '✓') has a descriptive `aria-label` attribute.
