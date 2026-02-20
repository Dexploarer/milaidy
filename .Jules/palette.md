# Palette's Journal

## 2025-02-23 - App Workspace Tooling Issues
**Learning:** The `apps/app` workspace is excluded from root `biome` config (`!apps`), making `lint` scripts ineffective for it. Additionally, `bun test` fails with `Cannot find module 'react/jsx-dev-runtime'`, likely due to `tsconfig` or environment misconfiguration for the new JSX transform.
**Action:** Rely on manual verification and `tsc` (if dependencies allow) for `apps/app`. Future work should address the `biome` exclusion and test environment setup.
