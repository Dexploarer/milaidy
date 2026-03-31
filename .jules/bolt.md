## 2024-05-18 - Unnecessary sorting during controlled inputs
**Learning:** The ConversationsSidebar sorts all conversations by `updatedAt` on every render. Because the component has a controlled input for editing conversation titles (`editingTitle` state), every keystroke causes the entire conversation array (which requires parsing string ISO dates) to be re-sorted.
**Action:** Always memoize computationally expensive list formatting and sorting operations in components that house frequently updated local state (like text inputs) to avoid blocking the main thread during user interaction.
