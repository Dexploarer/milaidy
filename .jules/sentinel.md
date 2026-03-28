## 2026-03-28 - [Fix Windows PowerShell Command Injection]
**Vulnerability:** Command injection vulnerability in `powershell -Command` execution due to insufficient escaping of single quotes (`'`) using `replace(/'/g, "''")`.
**Learning:** Single quote escaping in Windows PowerShell can be bypassed. Safe passing of user input requires base64 encoding it in Node.js and decoding it natively in PowerShell.
**Prevention:** Always encode user input as a Base64 string in Node.js (`Buffer.from(text).toString('base64')`) and decode it inside the PowerShell script block using `[System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${base64}'))`.
