## 2025-05-20 - [Security Headers Implementation]
**Vulnerability:** Missing standard HTTP security headers (HSTS, X-Frame-Options, CSP, etc.) in the API server.
**Learning:** The API server is a raw Node.js `http.Server` implementation, so headers must be manually applied. Middleware frameworks are not in use.
**Prevention:** Implemented `applySecurityHeaders` helper and integrated it into the request processing pipeline. Added E2E tests to verify header presence and correct CSP scoping (strict for API, lax for UI).
