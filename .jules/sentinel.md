## 2024-05-24 - React innerHTML Manipulation
**Vulnerability:** Direct manipulation of `parentElement.innerHTML` within a React `onError` handler (`MediaGalleryView.tsx`).
**Learning:** Bypassing React's virtual DOM to inject raw HTML strings via `innerHTML` introduces XSS risks, even if currently hardcoded. It breaks React's DOM reconciliation and creates a habit of insecure DOM writes.
**Prevention:** Use native DOM methods like `document.createElement` and `textContent`/`appendChild`, or ideally, manage fallback UI through React state variables instead of direct DOM mutations.
