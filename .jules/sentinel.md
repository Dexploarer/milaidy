## 2025-02-14 - Fix CWE-78 Command Injection in API sandbox routes
**Vulnerability:** Found uses of `execSync` evaluating concatenated string command inputs from API routes in `src/api/sandbox-routes.ts`.
**Learning:** Hardcoded system commands string evaluations are vulnerable to CWE-78 command injection when system parameters are dynamic.
**Prevention:** Instead of `execSync` evaluating strings, use `execFileSync` from `child_process` and separate arguments into a strict array parameter to ensure execution avoids shell evaluation. Make sure to specify `stdio: ['ignore', 'pipe', 'ignore']` for programs with verbose stderr like ffmpeg.
