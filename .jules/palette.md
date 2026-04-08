## YYYY-MM-DD - Fix Tooltip Keyboard Accessibility
**Learning:** Custom CSS tooltips that only use `group-hover` remain invisible to keyboard users. Tooltip text can also be redundantly vocalized by screen readers if the trigger already has an `aria-label`.
**Action:** Always add `group-focus-within` visibility utility classes alongside hover states for tooltips, and apply `aria-hidden="true"` to the tooltip popup if its wrapping element already has an `aria-label`.
