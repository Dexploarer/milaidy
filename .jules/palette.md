# Palette's Journal - Critical UX/A11y Learnings

## 2025-02-21 - [Icon Buttons vs Text Characters]
**Learning:** Using text characters like `×` for close/delete actions is poor UX; it's visually ambiguous and screen readers announce it as "multiplication sign" or "times".
**Action:** Replace text characters with inline SVG icons and always include `aria-label` for screen reader context.
