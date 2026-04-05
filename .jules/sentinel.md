## 2024-04-05 - XSS Vulnerability in DOM Manipulation
**Vulnerability:** XSS via `innerHTML` assignment in fallback UI logic.
**Learning:** Using `innerHTML` for DOM manipulation in React event handlers (`onError`) opens up XSS vulnerabilities.
**Prevention:** Use safer DOM APIs like `document.createElement`, `textContent`, and `appendChild` instead of `innerHTML`.
