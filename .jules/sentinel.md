## 2025-02-13 - Prevent XSS from innerHTML
**Vulnerability:** Found innerHTML usage in apps/app/src/components/MediaGalleryView.tsx within an onError handler for an <img> tag.
**Learning:** Fallback UIs in React should not be injected via innerHTML due to XSS risk and DOM reconciliation issues.
**Prevention:** Use native DOM methods like document.createElement, textContent, and appendChild.
