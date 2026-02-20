# Plugins TUI Management — /plugins

> Manage, search, install, and configure plugins directly from the Milaidy TUI via `/plugins`.

## Problem Statement

Plugin management currently requires either the CLI (`milaidy plugins list/install/config`) or the web frontend (`PluginsView.tsx`). TUI users — the primary power-user audience — have no way to browse, search, install, or configure plugins without leaving their terminal session. The frontend also has plugin store endpoint management (registry URLs) that isn't surfaced anywhere in the TUI or config layer.

## Target Users

- Power users running Milaidy in terminal mode
- Developers who prefer keyboard-driven workflows over web UIs
- Users managing remote/headless Milaidy instances without a browser

## Core Features (MVP)

### 1. `/plugins` TUI Overlay
- [ ] New overlay accessible via `/plugins` slash command and keyboard shortcut
- [ ] Tabbed navigation: **Installed** | **Store** | **Endpoints**
- [ ] Consistent with existing overlay patterns (model selector, settings)

### 2. Installed Plugins Tab
- [ ] List all loaded/enabled plugins with status indicators
- [ ] Real-time search/filter by name, description, or category
- [ ] Enable/disable toggle per plugin
- [ ] Expand plugin to view/edit configuration parameters
- [ ] Show plugin metadata (version, category, config status)

### 3. Plugin Store Tab
- [ ] Browse plugins from configured registry endpoints
- [ ] Search the registry by keyword
- [ ] Show plugin details (name, description, version, stars, compatibility)
- [ ] Install plugins directly from the store
- [ ] Show install progress inline
- [ ] Distinguish installed vs. available plugins

### 4. Endpoints Tab
- [ ] List configured registry endpoints
- [ ] Add new registry endpoint URLs
- [ ] Remove custom endpoints (protect the default ElizaOS registry)
- [ ] Edit endpoint labels/URLs
- [ ] Persist endpoints to `milaidy.json` config

### 5. Config Integration
- [ ] New `plugins.registryEndpoints` config section in `MilaidyConfig`
- [ ] Schema + zod validation for endpoints
- [ ] Registry client supports multiple endpoints

## Nice-to-Have (v2+)
- [ ] Plugin dependency resolution visualization
- [ ] Plugin update notifications in TUI
- [ ] Bulk enable/disable operations
- [ ] Plugin config export/import
- [ ] Test connection from TUI (like frontend)

## Constraints
- Must use existing `@elizaos/tui` components (SelectList, SettingsList, Input, Text)
- Must reuse existing services (`registry-client.ts`, `plugin-installer.ts`)
- Overlay follows same patterns as ModelSelectorComponent and SettingsOverlayComponent
- No new npm dependencies
- Files should stay under ~500 LOC per the coding style guide
- Must not break existing `/settings`, `/model`, or CLI plugin commands

## Architecture Notes

### Existing Patterns to Follow
- **Overlay**: `ModelSelectorComponent` — Input + SelectList with filter, overlay via `ui.showOverlay()`
- **Settings**: `SettingsOverlayComponent` — SettingsList with toggle/submenu pattern
- **Services**: `registry-client.ts` (getRegistryPlugins, searchPlugins) + `plugin-installer.ts` (installPlugin, listInstalledPlugins)
- **Config**: `types.milaidy.ts` types → `schema.ts` descriptions → `zod-schema.ts` validation

### New Files
- `src/tui/components/plugins-overlay.ts` — Main overlay with tab routing
- `src/tui/components/plugins-installed-tab.ts` — Installed plugins list + config
- `src/tui/components/plugins-store-tab.ts` — Store browse/search/install
- `src/tui/components/plugins-endpoints-tab.ts` — Endpoint management
- `src/tui/components/plugins-overlay.test.ts` — Unit tests

### Modified Files
- `src/tui/tui-app.ts` — Add `showPlugins()` method + overlay handle
- `src/tui/index.ts` — Add `/plugins` command handler
- `src/tui/components/index.ts` — Export new components
- `src/config/types.milaidy.ts` — Add `RegistryEndpoint` type + config
- `src/config/schema.ts` — Add schema descriptions
- `src/config/zod-schema.ts` — Add zod validation
- `src/services/registry-client.ts` — Support multiple endpoints

## Success Criteria
- `/plugins` opens a navigable overlay in the TUI
- User can search/filter installed plugins by typing
- User can browse and install plugins from the store
- User can add/remove custom registry endpoints
- All changes persist to `milaidy.json`
- Existing tests pass, new tests cover core functionality
