## 2024-05-23 - LogsView Re-render Bottleneck
**Learning:** The `LogsView` component receives a fresh array of log objects on every poll, causing the entire list to re-render even if the content hasn't changed. Inline mapping of rows exacerbates this.
**Action:** Extracted the row rendering into a `LogEntryRow` component and wrapped it in `React.memo` with a custom deep-equality check for props. This ensures rows only re-render when their actual data changes, not just when the parent array reference changes.
