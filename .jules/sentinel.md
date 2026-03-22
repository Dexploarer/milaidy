## 2024-05-24 - PowerShell Command Injection via Single-Quote Bypass
**Vulnerability:** Arbitrary user input passed to `powershell -Command` via `execSync` or `execFileSync` on Windows using standard single-quote escaping (e.g., `text.replace(/'/g, "''")`) can be bypassed, leading to command injection vulnerabilities.
**Learning:** Single-quote escaping is not sufficient for securing user input passed to PowerShell. It is possible to bypass standard escaping mechanisms in specific contexts.
**Prevention:** Encode user input as a Base64 string in Node (`Buffer.from(text).toString('base64')`) and decode it natively inside the PowerShell script block using `[System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${base64}'))` before using it.
