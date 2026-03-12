## 2024-05-18 - [Prevent Empty Buttons]
**Learning:** Adding `aria-hidden="true"` to visual icons (like "×") inside an otherwise textless button effectively removes the button's accessible name if an `aria-label` isn't also present on the button element itself.
**Action:** When hiding decorative elements within interactive controls, always explicitly verify that the parent control retains a descriptive `aria-label`.
