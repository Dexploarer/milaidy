## 2024-04-19 - Hover-hidden secondary actions break keyboard navigation
**Learning:** The application uses `sm:opacity-0 sm:group-hover:opacity-100` to hide secondary actions (like delete buttons) until hover. This pattern inherently breaks keyboard navigation (tabbing) because focused elements remain invisible.
**Action:** When implementing hover-hidden elements, always pair them with `focus:opacity-100 focus-visible:ring-2` so they become visible and navigable via keyboard. Also ensure literal characters like '×' have an explicit `aria-label`.
