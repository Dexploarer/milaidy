## 2025-02-24 - Node.js to PowerShell Command Injection

**Vulnerability:** Command injection when passing user input to `powershell -Command` via Node.js using string escaping `replace(/'/g, "''")`.
**Learning:** Standard single-quote escaping in PowerShell `-Command` blocks is easily bypassed or mishandled by the Node.js/shell boundary.
**Prevention:** Always encode user input as a Base64 string in Node.js (`Buffer.from(text).toString('base64')`) and decode it natively inside the PowerShell script block using `[System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${base64}'))`.
