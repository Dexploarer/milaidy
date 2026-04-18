## 2024-04-18 - Caching detectPackageManager
**Learning:** `detectPackageManager` runs `execFileAsync("bun", ["--version"])` multiple times synchronously, and is called in multiple places (install, eject). Shell commands are expensive.
**Action:** Use a cached promise to execute the shell command only once across concurrent and sequential calls.
