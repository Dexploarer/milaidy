## 2024-03-29 - Improve SecretsView Accessibility
**Learning:** Found multiple buttons in `SecretsView.tsx` missing proper `aria-label`s, especially icon-only buttons like the modal close button (`x`) and the remove secret button (`x`). The category collapse button also needed `aria-expanded` and `aria-controls`.
**Action:** Always ensure icon-only buttons or buttons with visual-only indicators (like `x`) have an `aria-label` describing their action. For collapsible sections, use `aria-expanded`.
