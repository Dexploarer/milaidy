## 2024-05-24 - Fix Command Injection in PowerShell Computer Input
**Vulnerability:** Command injection vulnerability in `performType` and `performKeypress` via unsanitized PowerShell commands execution when standard single-quote escaping is bypassed.
**Learning:** Standard escaping mechanisms like `text.replace(/'/g, "''")` can be bypassed when passing user input to `powershell -Command` via `execSync` or `execFileSync` on Windows, leading to command injection vulnerabilities.
**Prevention:** Always encode arbitrary user input as a Base64 string in Node.js, and decode it natively inside the PowerShell script block using `[System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${base64}'))`.
