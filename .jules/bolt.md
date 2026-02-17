## 2024-05-24 - Environment Verification Blocked
**Learning:** The root workspace configuration for `@elizaos/core` has a broken dependency path (`/prompts`), preventing `pnpm install` and full test execution.
**Action:** When working in `apps/app`, rely on `tsc` for verification if root install fails, as partial `node_modules` might exist. Prioritize fixes that can be verified statically or with isolated tests.
