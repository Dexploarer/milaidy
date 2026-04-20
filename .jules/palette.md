## 2024-04-20 - Keyboard Accessibility for Hover-hidden Icon Buttons
**Learning:** Interactive elements hidden by hover states (`sm:opacity-0`) lack keyboard visibility when receiving focus, and icon-only buttons using literal text characters (like '×') lack screen reader context and are vocalized incorrectly.
**Action:** Always add `focus:opacity-100 focus-visible:ring-2` utility classes to hover-hidden interactive elements, and include an explicit `aria-label` for literal text characters to ensure predictable vocalization by screen readers.
