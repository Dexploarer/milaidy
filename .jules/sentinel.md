
## 2025-02-12 - Fix command injection in audio recording
**Vulnerability:** Command Injection in `recordAudio` via `execSync` with `tmpFile` argument. On Windows, arguments were manually quoted which could cause double escaping.
**Learning:** `execSync` interprets commands in a shell, making unescaped paths vulnerable to injection. Also, `ffmpeg` can deadlock if `stderr` is redirected to pipe without being consumed.
**Prevention:** Use `execFileSync` instead of `execSync` for shell commands that take file path arguments. Define arguments as an array instead of string concatenating. Configure `stdio: ['ignore', 'pipe', 'ignore']` for `ffmpeg` to natively ignore `stderr` to prevent deadlocks.
