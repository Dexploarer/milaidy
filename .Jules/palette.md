## 2025-05-22 - [Hidden Tooltips Accessibilty]
**Learning:** Tooltips relying solely on `display: none` via hover are inaccessible to keyboard users. Even with `:focus-within`, initial visibility must be managed.
**Action:** Use `:focus-within` on wrapper elements to toggle visibility, ensuring child interactive elements become reachable via Tab order.
