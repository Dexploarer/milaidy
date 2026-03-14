
## 2025-02-14 - PowerShell Command Injection via SendKeys
**Vulnerability:** Command injection when passing user input to `powershell -Command` via `SendKeys` by simply escaping single quotes `replace(/'/g, "''")`.
**Learning:** Escaping single quotes is insufficient on Windows because PowerShell can evaluate inputs and execute chained commands.
**Prevention:** Encode user input as a Base64 string in Node, and decode it natively inside the PowerShell script block using `[System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${base64}'))`.
