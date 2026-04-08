## 2024-05-14 - Add aria-labels to 'x' icons for screen readers
**Learning:** Screen readers may read the literal multiplication sign "×" unpredictably (e.g. as "times" or "multiply"). Icon-only interactive elements using literal characters require explicit `aria-label`s to be vocalized correctly.
**Action:** When adding or modifying icon-only buttons using text characters like "×" for closing or deleting, always add a descriptive `aria-label` attribute (e.g., "Close", "Remove option") to provide proper vocalization context for screen reader users.
