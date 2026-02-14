## 2026-02-14 - Raw Node.js Server Header Management
**Vulnerability:** Missing standard HTTP security headers (CSP, X-Frame-Options, etc.) on the API server.
**Learning:** The API server (`src/api/server.ts`) is implemented as a raw Node.js `http.Server` without a framework like Express or Fastify. This means standard middleware (like `helmet`) cannot be easily dropped in, and security headers must be applied manually to every response.
**Prevention:** When adding new endpoints or modifying the server, ensure `applySecurityHeaders` (or similar helper) is invoked. Future architectural decisions should consider using a minimal framework to leverage established security middleware ecosystems.
