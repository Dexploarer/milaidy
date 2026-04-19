## 2025-04-19 - Caching detectPackageManager
**Learning:** `detectPackageManager` in `plugin-installer.ts` is called multiple times but does not cache the result. The `bun --version` or `npm --version` `execFileAsync` calls can be expensive, particularly in CI or slower development environments.
**Action:** Always cache simple async detection routines that don't change state over the process lifetime.
