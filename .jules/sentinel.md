## 2024-05-30 - Fix Command Injection in PowerShell via SendKeys
**Vulnerability:** Command injection in `powershell -Command` via `execSync`/`runCommand` by only replacing single quotes.
**Learning:** Standard single-quote escaping (`replace(/'/g, "''")`) can be bypassed in PowerShell commands called via Node.js.
**Prevention:** Always encode user input as a Base64 string in Node.js (`Buffer.from(text).toString('base64')`) and decode it natively inside the PowerShell script block.
