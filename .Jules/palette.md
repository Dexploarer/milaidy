## 2025-05-24 - Accessibility of Hover-State Actions
**Learning:** Actions that are only visible on hover (like delete buttons in lists) are invisible to keyboard users and screen readers unless specific focus styles and ARIA labels are added.
**Action:** Always add `focus:opacity-100` (or equivalent) to elements with `opacity-0 group-hover:opacity-100`, and ensure they have `aria-label`.
