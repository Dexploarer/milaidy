## 2024-05-18 - Accessibility: Hiding Raw Text Characters

**Learning:** When using raw text characters like `×` or `&times;` for icon buttons, screen readers will often read them out aloud alongside the `aria-label`, leading to a confusing experience like "Remove image times".

**Action:** Always wrap visual text characters in `<span aria-hidden="true">` when the button already has an `aria-label` to ensure the screen reader only reads the intended accessible label.
