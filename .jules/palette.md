## 2025-03-09 - Ensure Text-Character Icons are Hidden from Screen Readers
**Learning:** Icon-only buttons using text characters like "×" or "&times;" can be confusingly announced by screen readers (e.g., as "times" or "multiplication X"). They must be explicitly hidden from assistive technology, even if an `aria-label` is present.
**Action:** Always wrap text-character icons (like `&times;` or `×`) inside a `<span aria-hidden="true">` when used within icon-only buttons, and ensure the button itself has an appropriate `aria-label`.
