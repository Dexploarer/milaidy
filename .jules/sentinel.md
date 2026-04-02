## 2024-04-02 - Fix PowerShell Command Injection via SendKeys
**Vulnerability:** Arbitrary user input passed to `powershell -Command` for `SendKeys` was escaped only by replacing single quotes `\'`, which can be bypassed.
**Learning:** Node.js spawning PowerShell with standard string escaping is easily bypassed due to complex shell parsing behaviors on Windows.
**Prevention:** Always encode arbitrary input as Base64 in Node.js and decode it natively inside the PowerShell script block using `[System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${base64}'))` to prevent command injection.
