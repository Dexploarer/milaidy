## 2024-05-30 - Command Injection in PowerShell via Node.js
**Vulnerability:** Arbitrary user input passed to `powershell -Command` in `performType` and `performKeypress` functions could bypass standard single-quote escaping (`''`) in Node.js, leading to potential command injection.
**Learning:** Standard escaping mechanisms in Node.js for PowerShell execution can be bypassed when dealing with arbitrary input, exposing a critical command injection vector.
**Prevention:** To prevent command injection, always encode user input as a Base64 string in Node.js (`Buffer.from(text).toString('base64')`) and decode it natively inside the PowerShell script block using `[System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${base64}'))`.
