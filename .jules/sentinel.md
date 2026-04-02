## 2025-04-02 - Fix Command Injection in PowerShell Execution
**Vulnerability:** User input passed to PowerShell commands in `src/api/sandbox-routes.ts` (specifically in `performType` and `performKeypress`) used standard single-quote escaping (`replace(/'/g, "''")`), which can be easily bypassed to execute arbitrary commands.
**Learning:** Standard escaping is insufficient when passing arbitrary user input to `powershell -Command` via Node.js on Windows.
**Prevention:** Always encode user input as a Base64 string in Node.js (`Buffer.from(text).toString('base64')`) and decode it natively inside the PowerShell script block using `[System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${base64}'))` to prevent command injection.
