## 2024-10-24 - PowerShell Command Injection via ExecSync on Windows
**Vulnerability:** Sandbox route `performType` and `performKeypress` passed arbitrary string literals to PowerShell via `-Command`. Simplistic escaping `text.replace(/'/g, "''")` is insufficient and can be bypassed to achieve command injection on the host.
**Learning:** PowerShell parsing rules are complex. Standard single-quote escaping is not foolproof when arguments traverse `cmd.exe` or `execSync` shells.
**Prevention:** Always encode user input passed to PowerShell as a Base64 string in Node.js (`Buffer.from(text).toString('base64')`) and decode it natively inside the PowerShell script block using `[System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${base64}'))`.
