## 2024-04-15 - Missing ARIA labels on "close" icon-only buttons
**Learning:** Many interactive close buttons in modal headers or popups using literal characters like "×" lack proper `aria-label` attributes for screen readers, meaning they are vocalized literally (e.g. "times" or "multiply").
**Action:** Always verify if close buttons (`×`, `&times;`) have an `aria-label` like "Close" or similar descriptive text.
