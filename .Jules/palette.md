## 2024-05-14 - Automated review tool false positives with dynamic template literals
**Learning:** Automated code review tools may incorrectly flag missing accessibility attributes (like `aria-label`) if they are implemented using dynamic JSX template literals (e.g., `aria-label={\`Remove ${name}\`}`).
**Action:** Always manually verify the file contents before acting on such review feedback to avoid fixing false positive regressions.
