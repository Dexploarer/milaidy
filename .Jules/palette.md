## 2024-04-01 - Add ARIA Labels to Modal Close Buttons and Collapsible Sections
**Learning:** Found an accessibility issue pattern where icon-only buttons (`&times;`) lack ARIA labels, making them inaccessible to screen readers. Also, collapsible sections need `aria-expanded` and `aria-controls` to reflect visibility state and associate the toggle with the content.
**Action:** Always add `aria-label` to icon-only buttons and use `aria-expanded` and `aria-controls` for collapsible sections.
