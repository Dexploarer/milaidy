## 2025-03-03 - Dynamic aria-labels in ChatView
**Learning:** The ChatView "Remove image" button uses a dynamic JSX template string for its aria-label (``aria-label={`Remove image ${img.name}`}``). Automated code review tools might incorrectly flag this as missing an aria-label because they are looking for static string literals.
**Action:** When automated code review flags missing aria-labels, always manually verify the file contents to see if the label is generated dynamically via JSX before attempting to "fix" a false positive regression.
