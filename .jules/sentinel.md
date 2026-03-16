## 2024-05-24 - Fix Command Injection in PowerShell Script Execution
**Vulnerability:** Command injection vulnerability in Windows sandbox capabilities due to naive single-quote escaping (`text.replace(/'/g, "''")`) of user inputs directly interpolated into `powershell -Command` arguments.
**Learning:** Standard string manipulation for escaping inputs passed to PowerShell script blocks via Node's `execSync` is insufficient and can be bypassed, allowing attackers to execute arbitrary shell commands.
**Prevention:** Encode arbitrary user inputs as Base64 strings in Node.js, and natively decode them inside the PowerShell script block using `[System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($base64string))`.
