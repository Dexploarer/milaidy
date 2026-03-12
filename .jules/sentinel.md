## 2026-03-12 - PowerShell Command Injection via SendKeys Bypass
**Vulnerability:** User inputs passed to `powershell -Command` for Windows SendKeys were unsafely escaped using simple single-quote replacement (`text.replace(/'/g, "''")`), creating command injection vectors.
**Learning:** Naive single-quote replacement is insufficient for PowerShell commands executed via `child_process` since shell metacharacters or encoded string payloads can bypass it and execute arbitrary code.
**Prevention:** Always encode arbitrary user input as a Base64 string in Node.js before passing it to PowerShell, then decode it natively within the PowerShell script block using `[System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${base64}'))`.
