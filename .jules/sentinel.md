## 2025-02-18 - [API Security Headers]
**Vulnerability:** Missing Content-Security-Policy (CSP) and Permissions-Policy headers in API responses.
**Learning:** The API server also serves the static UI in production, making CSP crucial for mitigating XSS risks. Also, `bun test` requires explicit mocks for dependencies when `node_modules` are incomplete or path mappings are broken.
**Prevention:** Enforce security headers in the central CORS/headers middleware (`applyCors`) to ensure they apply to all responses.
