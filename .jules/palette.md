## 2024-05-23 - Nested Interactive Elements in Clickable Containers
**Learning:** When adding `role="button"` and `tabIndex={0}` to a container `div` that contains other interactive elements (like a delete button), the container's keyboard handler (`onKeyDown`) can accidentally intercept events from nested elements (due to bubbling).
**Action:** Always check `if (e.target !== e.currentTarget) return;` in the container's keyboard handler to ensure nested interactive elements retain their default behavior.
