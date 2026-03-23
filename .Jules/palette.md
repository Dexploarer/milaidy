
## 2026-03-23 - Icon-Only Buttons Accessibility
**Learning:** Hiding visual text without ensuring a parent `aria-label` exists causes a major accessibility regression by making the button invisible to screen readers. Visual content like the "×" character must be wrapped in `<span aria-hidden="true">`.
**Action:** When implementing icon-only buttons with text characters or SVG icons, always add an `aria-label` to the parent button element and wrap the visual child element in a tag with `aria-hidden="true"`.
