## 2025-02-17 - Missing Security Headers in API Server
**Vulnerability:** The API server (`src/api/server.ts`) was missing standard security headers (`Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`) despite documentation/memory suggesting they were implemented.
**Learning:** Documentation and memory can drift from the actual codebase state. "Trust but verify" is crucial. Security features must be explicitly tested.
**Prevention:** Added `test/api-security-headers.e2e.test.ts` to enforce the presence of these headers. Always verify security controls with automated tests.

## 2025-02-24 - API Rate Limiting Implementation
**Vulnerability:** The API server lacked rate limiting, exposing it to potential DoS attacks and brute-force attempts.
**Learning:** Implementing rate limiting requires careful consideration of memory management (cleanup of old entries) and proxy support (`X-Forwarded-For`), even for "local" apps which might be exposed via tunnels. Global state in modules should be avoided to ensure test isolation.
**Prevention:** Added a `rateLimitMap` to the `ServerState` with a periodic cleanup interval. Implemented logic to check `X-Forwarded-For` before `remoteAddress`.
