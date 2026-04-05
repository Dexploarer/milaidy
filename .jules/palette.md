## 2024-05-24 - Tooltips and Keyboard Accessibility
**Learning:** Custom CSS tooltips must always include group-focus-within visibility modifiers to ensure keyboard navigation parity, and should use aria-hidden="true" if the wrapped elements already use aria-label to prevent screen reader double-vocalization.
**Action:** Always add group-focus-within:opacity-100 group-focus-within:visible and pointer-events-none along with aria-hidden="true" when building custom icon button tooltips.
