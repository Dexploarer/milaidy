## 2024-05-18 - Icon-only buttons with visual text need aria-hidden

**Learning:** When using visual text characters like '×' or '&times;' in an icon-only button, screen readers will read the visual text out loud. Even if an `aria-label` is present, it will read both unless the visual text is hidden with `aria-hidden="true"`. However, if the button has NO `aria-label` and the visual content is hidden with `aria-hidden="true"`, the button becomes completely invisible to screen readers, causing a major accessibility regression.

**Action:** For any icon-only button using visual characters, always add a descriptive `aria-label` to the parent button, AND wrap the visual character in an element with `aria-hidden="true"` (or apply `aria-hidden="true"` to the SVG).
