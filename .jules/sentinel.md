## 2024-05-20 - Prevent Command Injection in PowerShell on Windows
**Vulnerability:** Command injection when passing arbitrary user input (text, keypresses) to `powershell -Command` via Node.js on Windows. Standard single-quote escaping `replace(/'/g, "''")` can be bypassed.
**Learning:** Node.js execution on Windows `powershell -Command` blocks are inherently risky when string interpolating user data because escaping mechanisms are fragile against complex payloads or encoded strings.
**Prevention:** Always encode user input as a Base64 string in Node.js (`Buffer.from(text).toString('base64')`) and decode it natively inside the PowerShell script block using `[System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${base64}'))`.
