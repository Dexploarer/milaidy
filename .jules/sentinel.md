## 2025-03-05 - Shell command injection risk in child_process execution
**Vulnerability:** Shell command injection via `execSync` taking unsanitized inputs such as `tmpFile` (which depends on `os.tmpdir()`) and `cmd` in functions like `recordAudio` and `commandExists`.
**Learning:** `execSync` treats its input as a shell string, allowing attackers or edge-case system paths (e.g., spaces or shell characters in `tmpdir()`) to inject unintended commands.
**Prevention:** Always use `execFileSync` or `spawn` instead of `execSync`/`exec`, passing the command and an array of strictly isolated arguments to prevent shell interpretation.
