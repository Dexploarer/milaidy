# Features & Usage

Milaidy is more than just a chatbot; it's a capable personal assistant with a rich feature set.

## CLI Commands

You can control Milaidy directly from your terminal using the `milaidy` command.

| Command | Description |
|---|---|
| `milaidy start` | Starts the agent runtime (default command). |
| `milaidy setup` | Initializes the workspace and configuration files. |
| `milaidy dashboard` | Opens the Control UI in your default web browser. |
| `milaidy configure` | Launches the interactive configuration wizard. |
| `milaidy config get <key>` | Reads a specific configuration value. |
| `milaidy models` | Shows the currently configured model providers. |
| `milaidy plugins list` | Lists all available and installed plugins. |
| `milaidy --help` | Shows all available commands and options. |

## Chat Commands

When interacting with Milaidy (via the dashboard or any connected chat platform), you can use special commands to control the agent.

| Command | Description |
|---|---|
| `/status` | Shows the current session status, including model usage, token count, and estimated cost. |
| `/new` or `/reset` | Clears the current conversation history and starts a fresh session. |
| `/compact` | Summarizes the current conversation to save context window space. |
| `/think <level>` | Adjusts the "reasoning" level. Options: `off`, `minimal`, `low`, `medium`, `high`, `xhigh`. Higher levels produce more thoughtful but slower responses. |
| `/verbose on|off` | Toggles verbose logging for debugging. |
| `/usage off|tokens|full` | Controls the visibility of usage statistics in the footer of each response. |
| `/restart` | Restarts the Gateway service (useful if you've changed configuration). |

## Dashboard (Control UI)

The web dashboard is your command center, typically available at `http://localhost:2138`.

### Key Features:
- **Chat Interface**: Talk to your agent directly.
- **Wallet & Inventory**: View your crypto assets (tokens and NFTs) across EVM and Solana chains.
- **Configuration**: Modify settings visually (some settings may require a restart).
- **Logs**: View real-time logs of the agent's thought process and actions.

## Skills & Knowledge

Milaidy learns through "skills" and knowledge files.

### Skills
Skills are specialized capabilities (like "weather checking" or "crypto trading").
- Skills are located in `~/.milaidy/workspace/skills/`.
- Each skill has a `SKILL.md` file defining its prompts and capabilities.

### Knowledge Injection
You can inject custom knowledge into your agent by editing these files in `~/.milaidy/workspace/`:
- **`IDENTITY.md`**: Defines who the agent is (core personality).
- **`USER.md`**: Information about *you* (the user) that the agent should know.
- **`TOOLS.md`**: Documentation on available tools.

## Security Model

Milaidy is designed with security in mind, especially for personal use.

- **Main Session**: By default, the "main" session (when you chat directly via the dashboard) runs tools on your host machine. This gives the agent full power to help you.
- **Sandboxing**: For non-main sessions (e.g., public group chats), you can enable sandboxing.
    - Set `agents.defaults.sandbox.mode: "non-main"` in your config.
    - This runs sessions inside Docker containers, preventing them from accessing your local file system or network indiscriminately.

## Plugins

Milaidy supports the ElizaOS plugin ecosystem. Plugins can add support for new:
- **Models**: Connect to new AI providers.
- **Clients**: Chat on platforms like Discord, Twitter, Telegram.
- **Actions**: Perform tasks like sending emails, managing calendars, or trading crypto.

To list available plugins:
```bash
milaidy plugins list
```
