## 2026-03-14 - Command Injection via PowerShell in Sandbox Routes
**Vulnerability:** Command injection was possible when executing `powershell -Command` via `execFileSync` or `execSync` by passing unsanitized user inputs (`text`, `keys`) replacing single quotes with `''`.
**Learning:** Standard single-quote escaping (e.g., `text.replace(/'/g, "''")`) can be bypassed on Windows PowerShell, causing command injection vulnerabilities.
**Prevention:** Always encode user inputs as Base64 strings in Node (`Buffer.from(text).toString('base64')`) and decode natively inside the PowerShell script block using `[System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${base64}'))` when passing arbitrary text to PowerShell commands.
