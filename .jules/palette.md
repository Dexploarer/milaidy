## 2025-02-24 - Accessible hidden icon buttons
**Learning:** Icon buttons that only appear on hover (`group-hover:opacity-100`) are completely inaccessible to keyboard users unless they also become visible on focus (`focus:opacity-100`), and they must always include an `aria-label` since visual titles aren't read by screen readers.
**Action:** Always add `focus:opacity-100 focus-visible:ring-2` to buttons hidden by hover states, and pair `aria-label` with `title` for icon-only buttons.
