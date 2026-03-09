## 2024-05-24 - Command Injection via execSync
**Vulnerability:** Found unsanitized variables (`tmpFile` and `durationSec`) interpolated into shell strings passed directly to `execSync` during audio recording operations in `src/api/sandbox-routes.ts`.
**Learning:** `execSync` executes via a shell context, making variables susceptible to escaping or chaining if poorly sanitized, especially when files are constructed from variables like `Date.now()`.
**Prevention:** Always use child_process methods that accept argument arrays (e.g., `execFileSync`, `spawn`) over shell interpolation. Convert string-based redirections (e.g., `2>/dev/null`) to safe native pipe configuration (`stdio: ["ignore", "pipe", "ignore"]`). For Windows, specify command arguments plainly without inner quoting.
