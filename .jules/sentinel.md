## 2025-03-31 - PowerShell Command Injection via Node.js execSync
**Vulnerability:** Command injection in `performType` when passing arbitrary user input to `powershell -Command` by attempting to escape single quotes.
**Learning:** Node.js wraps string arguments to cmd/powershell in double quotes on Windows. Single quote escaping (`''`) inside double quotes can be bypassed or misinterpreted, leading to command execution.
**Prevention:** Always encode arbitrary user input as a Base64 string in Node.js and decode it natively inside the PowerShell script block using `[System.Convert]::FromBase64String`.
