## 2026-04-16 - Environment test runner failure workaround
**Learning:** `vitest` unit tests may fail environment setups due to `bunx ENOENT` or unresolved `vitest/config` when testing frontend components structurally.
**Action:** When changes are structural without logic change, it is safe to proceed as long as `tsc --noEmit` checks out or similar unit build scripts pass.
