## 2025-02-12 - [Security Headers Enhancement]
**Vulnerability:** Missing standard HTTP security headers (HSTS, CSP, etc.) in API responses.
**Learning:** Adding `Content-Security-Policy: default-src 'none'` is a safe and effective default for pure JSON API servers, significantly reducing XSS surface area if the API accidentally serves HTML/SVG content.
**Prevention:** Use a middleware (like Helmet for Express, or custom function for raw Node http) to set secure defaults on all responses.
