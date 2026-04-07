## 2024-04-07 - Add missing aria-label to icon buttons with titles
**Learning:** Even when icon buttons have a `title` attribute for visual tooltips, they need an explicit `aria-label` for screen reader accessibility, as the title attribute is not consistently read out by all screen readers.
**Action:** Always add an explicit `aria-label` attribute to icon-only buttons, even if they already have a visual `title` attribute, to ensure proper screen reader vocalization.
