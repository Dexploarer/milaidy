## 2025-05-15 - API Security Headers Implementation
**Vulnerability:** Missing standard security headers (CSP, X-Frame-Options, HSTS, etc.) on API responses.
**Learning:** The API server (`src/api/server.ts`) is a raw Node.js `http.Server` implementation, not Express/Fastify, so middleware libraries like `helmet` cannot be used directly. Headers must be set manually on `res.setHeader`.
**Prevention:** Added `applySecurityHeaders` helper function and integrated it into the main request handler loop to ensure all responses are secured by default.
