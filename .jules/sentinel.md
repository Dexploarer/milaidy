## 2024-10-25 - Prevent PowerShell Command Injection
**Vulnerability:** Arbitrary user input to PowerShell `-Command` strings, specifically on Windows, could be manipulated to bypass simple escaping.
**Learning:** Using basic string escaping like `'` -> `''` is not safe enough for arbitrary user strings in `powershell -Command` arguments in Node.js.
**Prevention:** Always encode user strings in base64 in Node, and decode them natively within the PowerShell script using `[System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String(...))`
