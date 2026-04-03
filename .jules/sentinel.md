## 2024-05-24 - Command Injection in Windows PowerShell via Node.js
**Vulnerability:** Arbitrary user input passed to `powershell -Command` in `performType` and `performKeypress` (Windows) could lead to command injection, as simple single-quote escaping is insufficient.
**Learning:** Standard single-quote escaping can be bypassed in `powershell -Command` arguments invoked via Node.js `exec`/`spawn`.
**Prevention:** Always encode user input as a Base64 string in Node.js and decode it natively inside the PowerShell script block.
