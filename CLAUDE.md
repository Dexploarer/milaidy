# Milady

AI agent platform with desktop app, streaming, and multi-platform deployment.

## Quick Start

```bash
# Install dependencies
bun install

# Desktop app (Electron + embedded agent)
bun run dev:desktop

# UI only (no agent runtime)
bun run dev:ui

# Agent runtime only (no UI)
bun run start

# Build everything
bun run build
```

## Architecture

```
milady/
├── src/                    # Agent backend (runtime, API server, services)
│   ├── api/server.ts       # HTTP/WS API server (~13K lines, 24+ route modules)
│   ├── api/retake-routes.ts# Retake.tv streaming routes
│   ├── runtime/eliza.ts    # ElizaOS agent runtime
│   ├── services/           # Business logic (stream-manager, app-manager, etc.)
│   └── plugins/retake/     # Retake.tv plugin (chat polling, viewer tracking)
│
├── apps/app/               # Frontend + Electron
│   ├── src/                # React UI (components, api-client, AppContext)
│   ├── electron/           # Electron main process + native modules
│   ├── plugins/            # Capacitor native plugins (9 plugins)
│   ├── public/             # Static assets (VRMs, animations, icons)
│   └── test/               # Vitest unit + E2E tests
│
├── packages/               # Internal libraries (plugin-coding-agent, etc.)
├── hyperscape/             # MMORPG subproject (has its own CLAUDE.md)
└── plugins/                # External plugin sources
```

## Tech Stack

- **Runtime**: Bun 1.1.38+ / Node.js 22+
- **Language**: TypeScript 5.9
- **UI**: React 19, Vite 5, Tailwind CSS 4
- **Desktop**: Electron + Capacitor 8
- **Agent**: ElizaOS with 30+ plugins
- **Build**: Turbo monorepo, tsdown, Biome linter
- **Tests**: Vitest 4, Playwright
- **DB**: Drizzle ORM, SQLite (dev) / PostgreSQL (prod)

## Development Commands

| Command | Purpose |
|---------|---------|
| `bun run dev:desktop` | Electron app with hot reload |
| `bun run dev:ui` | Vite dev server (UI only) |
| `bun run dev:all` | All components together |
| `bun run start` | Start agent runtime |
| `bun run build` | Build all (tsdown + plugins + electron) |
| `npm run test` | Run all tests |
| `npm run lint` | Biome lint |
| `npm run typecheck` | TypeScript check |
| `npm run check` | Typecheck + lint |

## API Reference

The agent exposes a REST + WebSocket API on the port shown at startup (default 2138).

### Core Agent

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/status` | Agent status (name, state, uptime) |
| POST | `/api/agent/start` | Start agent |
| POST | `/api/agent/stop` | Stop agent |
| POST | `/api/agent/restart` | Restart agent |
| GET | `/api/config` | Get agent config |
| PUT | `/api/config` | Update agent config |
| POST | `/api/restart` | Restart runtime |

### Chat & Conversations

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/conversations` | List conversations |
| POST | `/api/conversations` | Create conversation |
| GET | `/api/conversations/:id/messages` | Get messages |
| POST | `/api/conversations/:id/messages` | Send message |
| POST | `/api/conversations/:id/messages/stream` | Send message (SSE stream) |

### Character

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/character` | Get character config |
| PUT | `/api/character` | Update character |
| POST | `/api/character/generate` | AI-generate character field |
| GET | `/api/character/random-name` | Random agent name |

### Streaming (Retake.tv)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/retake/live` | Go live (start stream) |
| POST | `/api/retake/offline` | Stop stream |
| GET | `/api/retake/status` | Stream health (running, ffmpegAlive, uptime, frameCount) |
| POST | `/api/retake/frame` | Push frame buffer (Electron capture) |
| POST | `/api/retake/volume` | Set volume (0-100) |
| POST | `/api/retake/mute` | Mute audio |
| POST | `/api/retake/unmute` | Unmute audio |

### Knowledge

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/knowledge/stats` | Knowledge base stats |
| GET | `/api/knowledge/documents` | List documents |
| POST | `/api/knowledge/documents` | Upload document |
| DELETE | `/api/knowledge/documents/:id` | Delete document |
| POST | `/api/knowledge/search` | Semantic search |

### Plugins & Skills

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/plugins` | List plugins |
| GET | `/api/plugins/core` | List core plugins |
| POST | `/api/plugins/core/toggle` | Enable/disable core plugin |
| GET | `/api/skills` | List skills |
| POST | `/api/skills/refresh` | Refresh skills catalog |

### Other Key Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/connectors` | List connectors (discord, retake, etc.) |
| PUT | `/api/connectors/:id` | Save connector config |
| GET | `/api/triggers` | List triggers |
| POST | `/api/triggers` | Create trigger |
| GET | `/api/wallet/addresses` | Wallet addresses |
| GET | `/api/wallet/balances` | Wallet balances |
| GET | `/api/logs` | Agent logs (filterable) |
| GET | `/api/trajectories` | Action trajectories |

### WebSocket

Connect to `ws://<host>:<port>/ws` for real-time events:
- `terminal-output` — terminal command output
- `agent-event` — autonomous agent events
- `stream-event` — streaming events (chat, viewer stats)

### Frontend API Client

All endpoints are wrapped in `apps/app/src/api-client.ts` via the `MiladyClient` class.

```typescript
import { client } from "./api-client";

// Examples
const status = await client.getStatus();
const stream = await client.retakeStatus();
await client.retakeGoLive();
await client.sendConversationMessage(convId, { text: "hello" });
```

## Feature Flags

In `apps/app/src/navigation.ts`:

| Flag | Purpose | Default |
|------|---------|---------|
| `APPS_ENABLED` | Show/hide Apps tab | `true` |
| `STREAM_ENABLED` | Show/hide Stream tab | `true` |

## Key Files

| File | Purpose |
|------|---------|
| `src/api/server.ts` | Main API server (route registration, WebSocket) |
| `src/runtime/eliza.ts` | ElizaOS agent runtime initialization |
| `src/api/retake-routes.ts` | Retake.tv streaming API |
| `src/services/stream-manager.ts` | FFmpeg stream lifecycle |
| `src/plugins/retake/index.ts` | Retake chat polling, viewer tracking, emotes |
| `apps/app/src/api-client.ts` | Frontend API client (`MiladyClient` class) |
| `apps/app/src/App.tsx` | Main app shell, tab routing |
| `apps/app/src/AppContext.tsx` | Global state, WS event parsing |
| `apps/app/src/navigation.ts` | Tab definitions, feature flags |
| `apps/app/src/components/StreamView.tsx` | Stream view (Go Live, PIP, activity feed) |
| `apps/app/electron/src/index.ts` | Electron main process entry |
| `apps/app/electron/src/setup.ts` | Window setup, PIP/popout config |
| `apps/app/electron/src/native/screencapture.ts` | Frame capture for streaming |

## Git Conventions

- Conventional commits: `feat(scope):`, `fix(scope):`, `refactor:`
- Scopes: `app`, `retake`, `electron`, `avatar`, `assets`, `streaming`
- Binary assets (.glb) tracked via git-lfs
- Feature branches merge to `develop`

## Testing

```bash
# All tests
npm run test

# Specific test file
npx vitest run apps/app/test/app/navigation.test.tsx

# Watch mode
npx vitest apps/app/test/app/

# E2E (Playwright)
npm run test:e2e
```

## Linting & Formatting

```bash
# Lint check
npx biome check <files>

# Auto-fix
npx biome check --write <files>

# TypeScript
npx tsc --noEmit -p apps/app/tsconfig.json
npx tsc --noEmit -p apps/app/electron/tsconfig.json
```

## Environment Variables

Key env vars for the agent runtime:

| Variable | Purpose |
|----------|---------|
| `RETAKE_AGENT_TOKEN` | Retake.tv API token |
| `RETAKE_API_URL` | Retake API base (default: `https://retake.tv/api/v1`) |
| `MILADY_ELECTRON_SKIP_EMBEDDED_AGENT` | Skip embedded agent in Electron |
| `MILADY_ELECTRON_DISABLE_AUTO_UPDATER` | Disable auto-updates |
| `LOAD_DOCS_ON_STARTUP` | Load knowledge docs on boot |
| `KNOWLEDGE_PATH` | Path to knowledge documents |

## Streaming Architecture

```
Electron renderer (StreamView)
  │ capturePage() every 33ms
  ▼
POST /api/retake/frame (JPEG buffer)
  │
  ▼
StreamManager (FFmpeg stdin pipe)
  │ RTMP push
  ▼
retake.tv ingest server
```

- Stream started manually via "Go Live" button or `POST /api/retake/live`
- Frame capture modes: `pipe` (Electron), `x11grab` (Linux), `avfoundation` (macOS)
- Stream health monitored via 30s watchdog + frame staleness detection
- PIP popout: always-on-top, visible-on-all-workspaces, CSS-transform scaling

## Plugins (`.gitignore`d)

`src/plugins/` is gitignored. Use `git add -f` when committing plugin changes.
