## 2026-03-25 - PowerShell Command Injection via Node.js
**Vulnerability:** User inputs passed to `powershell -Command` via `execSync` or `execFileSync` on Windows were escaped using simple single quotes (e.g., `text.replace(/'/g, "''")`). This is insufficient and can be bypassed, leading to command injection.
**Learning:** Standard single-quote escaping in PowerShell command execution from Node.js is vulnerable. Malicious inputs can break out of the string context and execute arbitrary code.
**Prevention:** Always encode user inputs as Base64 strings in Node.js (`Buffer.from(input).toString('base64')`) and decode them natively within the PowerShell script block using `[System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${base64}'))` before usage.
