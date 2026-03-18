## 2024-05-24 - PowerShell Command Injection via String Concatenation Bypass
**Vulnerability:** PowerShell commands in `sandbox-routes.ts` (`performType`, `performKeypress`, `playAudio`) constructed by escaping single quotes (`.replace(/'/g, "''")`) were vulnerable to command injection bypass on Windows.
**Learning:** Native single-quote escaping is not always robust against complex payloads or different PowerShell execution contexts when running `execSync` or `execFileSync` via `powershell -Command`.
**Prevention:** Always encode user-provided input as Base64 in Node.js (`Buffer.from(text).toString('base64')`) and decode it inside the PowerShell script block using `[System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${base64Text}'))`.
