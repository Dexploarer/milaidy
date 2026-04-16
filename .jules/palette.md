## 2025-04-16 - Add Focus Classes to Icon-only Buttons Hidden on Mobile

**Learning:** When hiding interactive icon buttons behind a hover state (`sm:opacity-0 sm:group-hover:opacity-100`), they become invisible and inaccessible via keyboard navigation on non-mobile viewports unless focused.
**Action:** Always add focus visibility utility classes (`focus:opacity-100` or `focus-visible:opacity-100`) and ensure an explicit `aria-label` is present for keyboard and screen reader accessibility on interactive elements using literal symbols like '×'.
