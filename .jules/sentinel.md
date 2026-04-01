## 2024-04-01 - Fix Command Injection in PowerShell SendKeys
**Vulnerability:** Arbitrary user input was passed directly into a `powershell -Command` string via standard single-quote escaping (`text.replace(/'/g, "''")`) for `performType` and `performKeypress`. This can be trivially bypassed.
**Learning:** Standard escaping is insufficient for executing dynamic user data inside PowerShell script blocks in Node.js on Windows.
**Prevention:** Always encode user input as a Base64 string in Node.js and decode it natively inside the PowerShell script block using `[System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${base64}'))` to completely prevent command injection.
