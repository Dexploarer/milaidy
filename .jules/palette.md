## 2025-04-24 - Dynamic ARIA Labels in Lists
**Learning:** When adding ARIA labels to repeating elements in a list (like delete/confirmation buttons in a sidebar chat list), injecting dynamic context (e.g., `conv.title`) is essential for screen reader users to distinguish which item they are acting upon, rather than hearing repeating identical labels.
**Action:** Always look for and utilize existing dynamic data (like titles or IDs) within mapping functions to create unique, descriptive ARIA labels for list item actions.
