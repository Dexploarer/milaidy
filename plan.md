1. **Optimize sorting in `apps/app/src/AppContext.tsx`**:
   - Use `replace_with_git_merge_diff` to modify `apps/app/src/AppContext.tsx` by replacing `new Date().getTime()` with `Date.parse()` in the `.sort` function.

2. **Verify edits in `apps/app/src/AppContext.tsx`**:
   - Use `grep -n "Date.parse" apps/app/src/AppContext.tsx` to output and check the contents to verify the edits were applied correctly.

3. **Optimize sorting in `apps/app/src/components/ConversationsSidebar.tsx`**:
   - Use `replace_with_git_merge_diff` to modify `apps/app/src/components/ConversationsSidebar.tsx` to wrap `sortedConversations` with `useMemo` with `[conversations]` as dependencies and replace `new Date().getTime()` with `Date.parse()`.
   - Update `import { useEffect, useRef, useState } from "react";` to include `useMemo`.

4. **Verify edits in `apps/app/src/components/ConversationsSidebar.tsx`**:
   - Use `cat` or `grep` to output and check the contents of `apps/app/src/components/ConversationsSidebar.tsx` to verify the edits.

5. **Verify the impact**:
   - Run linter/formatting tools: `./scripts/rt.sh x @biomejs/biome check --write apps/app/src/AppContext.tsx apps/app/src/components/ConversationsSidebar.tsx`
   - Run tests for modified files: `./scripts/rt.sh x vitest run apps/app/test/app/conversations-sidebar.test.tsx apps/app/test/app/app-context-autonomy-events.test.ts`

6. **Update `.jules/bolt.md`**:
   - Use `write_file` or `run_in_bash_session` to append a new journal entry about Date.parse vs new Date().getTime() and useMemo for derived state in React.

7. **Verify journal update**:
   - Use `cat .jules/bolt.md` to confirm the new entry was written correctly.

8. Complete pre-commit steps to ensure proper testing, verification, review, and reflection are done.

9. **Create PR / Submit**:
   - Use `submit` with Title: `⚡ Bolt: Optimize conversation list sorting performance`
   - Description containing What, Why, Impact, Measurement.
