## 2024-05-18 - First entry\n**Learning:** Just starting\n**Action:** None

## 2024-05-18 - Hiding text visual entities in buttons
**Learning:** Found an accessibility issue pattern where visual content like text characters (e.g. '×') used as icons in icon-only buttons need to be explicitly wrapped in `<span aria-hidden="true">` in addition to having an `aria-label` on the parent button. This prevents screen readers from redundantly announcing the visual character along with the label.
**Action:** Always check icon-only buttons not just for `aria-label`, but also ensure that any text-based visual icons are properly hidden from screen readers using `aria-hidden="true"`.
