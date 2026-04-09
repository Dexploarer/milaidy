## 2024-03-XX - Missing ARIA Labels on Icon-only Buttons
**Learning:** React components containing icon-only buttons using literal string characters (like "×" for closing modals) frequently lack `aria-label` attributes. This breaks screen-reader accessibility, causing it to read the character literally (e.g., "times" or "multiply") without context.
**Action:** When adding or fixing icon-only buttons, always supply an explicit `aria-label="Close"` (or appropriate action description) for accurate vocalization.
