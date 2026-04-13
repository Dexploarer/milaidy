## 2023-11-09 - Memoizing ChatMessage
**Learning:** In highly dynamic parent components like `ChatView`, where `chatSending` or other states can rapidly trigger parent re-renders, the list of child messages (`ChatMessage`) also re-renders constantly if not memoized.
**Action:** Always consider using `React.memo` for components rendered within loops or large lists when the parent is subject to frequent state updates that don't affect individual children.
