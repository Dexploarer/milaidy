## 2025-02-14 - LogsView Rendering Bottleneck
**Learning:** The `LogsView` component re-renders all log entries on every filter/search change because the list item rendering logic was inline, causing React to rebuild the entire virtual DOM for the list even when the underlying data objects were stable references.
**Action:** Extract list item rendering to memoized `LogEntryItem` components when dealing with large lists (like logs) where the parent component state changes frequently (e.g., search input) but the list items themselves are stable object references.
