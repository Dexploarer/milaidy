# Milaidy — Personal AI Assistant

**Milaidy** is a _personal AI assistant_ you run on your own devices, built on [ElizaOS](https://github.com/elizaos). The Gateway is the control plane that manages sessions, tools, and events. It connects to messaging platforms, companion apps, and a WebChat UI.

If you want a personal, single-user assistant that feels local, fast, and always-on, this is it.

## Quick Start — Zero Config

Get an agent running in seconds. No config files needed.

```bash
npx milaidy
```

On first run, Milaidy walks you through:
1. **Pick a name** for your agent (or use a random one)
2. **Choose a personality** style
3. **Connect a model** provider (or skip to configure later)

The agent starts immediately after onboarding. The web dashboard opens at `http://localhost:18789`.

## Documentation

- [**Getting Started**](docs/getting-started.md) — Installation and first run guide.
- [**Configuration**](docs/configuration.md) — Configure models, agents, wallets, and messaging platforms.
- [**Features & Usage**](docs/features.md) — Learn about chat commands, the dashboard, and skills.
- [**Development**](docs/development.md) — Build from source and contribute to the project.
- [**Deployment**](docs/deployment.md) — Release and signing guide.

## Download Desktop App

Download the latest release from **[GitHub Releases](https://github.com/milady-ai/milaidy/releases/latest)**:

| Platform | Download |
|---|---|
| macOS (Apple Silicon) | [`Milaidy-arm64.dmg`](https://github.com/milady-ai/milaidy/releases/latest) |
| macOS (Intel) | [`Milaidy-x64.dmg`](https://github.com/milady-ai/milaidy/releases/latest) |
| Windows | [`Milaidy-Setup.exe`](https://github.com/milady-ai/milaidy/releases/latest) |
| Linux | [`Milaidy.AppImage`](https://github.com/milady-ai/milaidy/releases/latest) / [`.deb`](https://github.com/milady-ai/milaidy/releases/latest) |

## Install (CLI)

**macOS / Linux / WSL:**
```bash
curl -fsSL https://milady-ai.github.io/milaidy/install.sh | bash
```

**Windows (PowerShell):**
```powershell
irm https://milady-ai.github.io/milaidy/install.ps1 | iex
```

## License

MIT
