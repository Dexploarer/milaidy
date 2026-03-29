## 2025-03-29 - Prevent Command Injection in PowerShell via Base64 Encoding
**Vulnerability:** Command injection vulnerability existed in `src/api/sandbox-routes.ts` where user inputs (keys and text) were passed to PowerShell commands via string interpolation with weak escaping (`text.replace(/'/g, "''")`).
**Learning:** Standard single-quote escaping is insufficient when passing arbitrary user input to `powershell -Command` via Node.js, allowing attackers to break out and execute arbitrary PowerShell scripts.
**Prevention:** Always encode user input as a Base64 string in Node.js (`Buffer.from(text).toString('base64')`) and decode it natively inside the PowerShell script block using `[System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${base64}'))`.
