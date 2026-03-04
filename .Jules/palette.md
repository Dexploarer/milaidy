## 2024-05-22 - [Hiding visual characters from screen readers]
**Learning:** Icon-only buttons or buttons using characters like `×` or `&times;` as icons can be confusing for screen reader users if not properly labeled. The character itself might be announced as "multiplication sign" or similar.
**Action:** Always provide an explicit `aria-label` for such buttons and wrap the visual character in a `<span>` with `aria-hidden="true"`.
