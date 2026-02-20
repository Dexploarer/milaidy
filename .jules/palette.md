## 2025-02-18 - Invisible Interactive Elements
**Learning:** Interactive elements that are hidden with `opacity-0` (like delete buttons) are invisible to keyboard users even when focused, unless `focus:opacity-100` is applied.
**Action:** Always pair `opacity-0` with `focus:opacity-100` for interactive elements to ensure they become visible during keyboard navigation.
