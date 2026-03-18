## 2024-05-20 - PowerShell Command Injection via SendKeys

**Vulnerability:** Arbitrary user input passed to `powershell -Command` via `execSync` / `execFileSync` could be exploited on Windows because standard single-quote escaping (`text.replace(/'/g, "''")`) can be bypassed in certain contexts, causing command injection.
**Learning:** Node's `execSync` running PowerShell does not natively prevent command injection from single-quoted strings if malicious constructs are used. Escaping is brittle.
**Prevention:** Encode user input as a Base64 string in Node (`Buffer.from(text).toString('base64')`) and decode it natively inside the PowerShell script block using `[System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${base64}'))`.
