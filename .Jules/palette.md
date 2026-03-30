## 2024-03-31 - Missing ARIA Labels on Icon-only Buttons
**Learning:** Icon-only buttons (like the `x` delete button in conversation lists) often rely entirely on visual `title` attributes or visual appearance to convey their purpose, which leaves screen reader users without critical context on destructive actions.
**Action:** Always add an explicit `aria-label` attribute to icon-only interactive elements, even when a `title` exists, to guarantee proper vocalization by screen readers.
