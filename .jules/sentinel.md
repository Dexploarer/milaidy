## 2025-02-18 - Missing Security Headers
**Vulnerability:** The API server was missing standard security headers (X-Frame-Options, X-Content-Type-Options, etc.), increasing risk of clickjacking and MIME-sniffing attacks.
**Learning:** `http.createServer` in Node.js does not apply security headers by default; they must be set explicitly or via middleware.
**Prevention:** Always use a helper like `applySecurityHeaders` or a middleware library (like Helmet) when setting up raw Node.js servers.
