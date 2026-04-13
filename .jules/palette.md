## 2024-05-16 - Add aria-label to icon-only close buttons
**Learning:** Icon-only close buttons that use literal text characters (like '×') can be read aloud inconsistently by screen readers (e.g., as 'multiply' or 'times').
**Action:** Always include an explicit `aria-label` (e.g., `aria-label="Close"`) on icon-only buttons using textual symbols to ensure predictable vocalization.
