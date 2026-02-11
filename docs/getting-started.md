# Getting Started with Milaidy

This guide will walk you through downloading, installing, and running your first Milaidy agent.

## Prerequisites

- **Node.js**: Version 22 or higher is required.
- **Package Manager**: `npm` (comes with Node.js) or `bun` (recommended for development).

## Installation Methods

### 1. Zero Config Quick Start (npx)

The fastest way to try Milaidy without installing anything globally.

```bash
npx milaidy
# OR
bunx milaidy
```

On first run, this will:
1.  Ask you to pick a name for your agent.
2.  Let you choose a personality style.
3.  Prompt you to connect a model provider (or skip).
4.  Launch the agent and open the dashboard at `http://localhost:18789`.

### 2. One-Line Installer (Recommended)

This script checks for Node.js, installs it if needed, installs Milaidy globally, and runs the initial setup.

**macOS / Linux / WSL:**
```bash
curl -fsSL https://milady-ai.github.io/milaidy/install.sh | bash
```

**Windows (PowerShell):**
```powershell
irm https://milady-ai.github.io/milaidy/install.ps1 | iex
```

### 3. Manual Installation (npm)

If you prefer to install manually using npm:

```bash
npm install -g milaidy
```

Then, start the agent:
```bash
milaidy start
```

## Desktop App

For a standalone experience, you can download the Milaidy Desktop App.

| Platform | Download |
|---|---|
| **macOS (Apple Silicon)** | [`Milaidy-arm64.dmg`](https://github.com/milady-ai/milaidy/releases/latest) |
| **macOS (Intel)** | [`Milaidy-x64.dmg`](https://github.com/milady-ai/milaidy/releases/latest) |
| **Windows** | [`Milaidy-Setup.exe`](https://github.com/milady-ai/milaidy/releases/latest) |
| **Linux** | [`Milaidy.AppImage`](https://github.com/milady-ai/milaidy/releases/latest) / [`.deb`](https://github.com/milady-ai/milaidy/releases/latest) |

### Verifying Downloads

Every release includes a `SHA256SUMS.txt` file. You can verify the integrity of your download:

**macOS / Linux:**
```bash
cd ~/Downloads
curl -fsSLO https://github.com/milady-ai/milaidy/releases/latest/download/SHA256SUMS.txt
shasum -a 256 --check --ignore-missing SHA256SUMS.txt
```

**Windows (PowerShell):**
```powershell
cd ~\Downloads
Invoke-WebRequest -Uri "https://github.com/milady-ai/milaidy/releases/latest/download/SHA256SUMS.txt" -OutFile SHA256SUMS.txt
# Compare manually:
Get-FileHash .\Milaidy-Setup.exe -Algorithm SHA256
Get-Content .\SHA256SUMS.txt
```

## First Run

When you first run `milaidy start` (or launch the desktop app), the setup wizard will guide you through:
- **Agent Identity**: Naming your agent.
- **Model Selection**: Choosing an AI provider (e.g., Anthropic, OpenAI, or local Ollama).
- **Wallet Generation**: Creating or importing crypto wallets (EVM/Solana).

Once running, the dashboard is accessible at:
- **Control UI**: `http://localhost:2138`
- **Gateway API**: `http://localhost:18789`

See [Configuration](./configuration.md) for more details on customizing your agent.
