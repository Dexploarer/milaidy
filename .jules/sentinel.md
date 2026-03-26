## 2024-05-17 - Fix PowerShell Command Injection in Sandbox Routes
**Vulnerability:** Arbitrary user input passed to `powershell -Command` via `SendKeys` was only escaped with single quotes.
**Learning:** Standard single-quote escaping in PowerShell can be bypassed.
**Prevention:** Always encode user input as Base64 in Node.js (`Buffer.from(text).toString('base64')`) and decode it natively inside the PowerShell script block (`[System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${base64}'))`).
