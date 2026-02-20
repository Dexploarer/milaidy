## 2026-02-20 - Manual Config Invalidation
**Learning:** `state.config` in `src/api/server.ts` is cached in memory but requires manual invalidation or reload when the underlying config file changes (e.g. via `installPlugin`). This was causing endpoints like `GET /api/plugins` to re-read the file on every request to be safe.
**Action:** Centralized config reloading where possible, or use explicit reloads after mutation operations. Future refactor should consider a `ConfigService` that emits events on change.
