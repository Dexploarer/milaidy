## 2025-02-18 - Missing API Security Headers
**Vulnerability:** API responses lacked standard security headers (`X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`), leaving the application vulnerable to clickjacking and MIME-sniffing attacks.
**Learning:** Default Node.js `http.createServer` and custom routing logic do not include these headers by default. Explicit middleware is required.
**Prevention:** Always implement a global response header middleware early in the request processing pipeline to ensure consistent security posture across all endpoints (including static assets and errors).
