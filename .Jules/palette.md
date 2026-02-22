## 2024-10-22 - Inaccessible Delete Buttons

**Learning:** The application uses "×" (multiplication sign) for delete/close buttons, which is announced as "times" by screen readers and lacks `aria-label` or focus visibility. This pattern is likely repeated elsewhere (e.g., `Header.tsx` close buttons, modal close buttons).

**Action:** When working on this codebase, check for "×" characters used as buttons and wrap them in `<span aria-hidden="true">` with an accompanying `aria-label` on the parent button. Ensure `focus:opacity-100` is added to initially-hidden buttons.
