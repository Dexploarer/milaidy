
## 2024-04-18 - Missing ARIA labels on semantic HTML entities
**Learning:** Using semantic HTML entities like `&times;` inside `<button>` elements for close/dismiss actions is a common pattern in the app's components, but often these buttons lack explicit `aria-label`s. Screen readers interpret `&times;` literally (e.g., "multiplication sign" or "times") instead of its contextual meaning ("Close"), leading to confusing vocalization.
**Action:** When implementing or reviewing icon-only buttons, especially those using symbols like `&times;` or SVG icons, always ensure a descriptive `aria-label` (e.g., `aria-label="Close dialog"`) is present. This is a quick win to prevent literal interpretation of symbols by assistive technologies.
