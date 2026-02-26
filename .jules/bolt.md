## 2025-02-21 - [State Management & Re-renders]
**Learning:** Components consuming `useApp` re-render on *any* state change (e.g., `chatInput` updates on every keystroke). This causes performance regressions in expensive sub-trees like `MessageList` if they are not strictly memoized and isolated from the parent component.
**Action:** When working in `apps/app`, always assume global state updates are frequent. Isolate expensive rendering logic (lists, heavy computations) into `React.memo`-wrapped child components that do not directly consume `useApp` unless necessary.
