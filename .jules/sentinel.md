## 2024-05-18 - [Fix Command Injection Vulnerabilities in Sandbox API]
**Vulnerability:** Shell command injection (CWE-78) via `execSync` where user inputs or predictable paths were concatenated into shell strings.
**Learning:** `execSync` executes commands within a shell environment, which opens up injection risks if untrusted or dynamic variables are passed. This bypasses the typical argument validation provided by strict exec functions.
**Prevention:** Use `execFileSync` and pass arguments as strict arrays rather than a single evaluated shell string. This directly executes the binary without a shell wrapper, neutralizing shell metacharacter injection.
