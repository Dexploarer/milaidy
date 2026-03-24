## 2026-03-24 - Hide visual cross and multiplication signs from screen readers
**Learning:** Screen readers audibly announce visual characters like '×' or '&times;' inside icon buttons (e.g. 'multiplication sign'), creating a confusing experience when an 'aria-label' already exists on the parent element.
**Action:** When using visual text characters as icons in buttons, always wrap them in '<span aria-hidden="true">' to hide them from assistive technologies, ensuring the parent button provides an accurate 'aria-label'.
