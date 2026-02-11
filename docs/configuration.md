# Configuration Guide

Milaidy is highly configurable. You can customize everything from the AI model and agent personality to the network ports and messaging platforms.

## Configuration File

The primary configuration file is located at:
**`~/.milaidy/milaidy.json`**

This file is created automatically when you first run Milaidy. It uses JSON5 format (standard JSON but allows comments and trailing commas).

### Basic Structure

```json5
{
  // Agent definitions
  agent: {
    model: "anthropic/claude-opus-4-5",
    // ...
  },

  // Environment variables override
  env: {
    ANTHROPIC_API_KEY: "sk-ant-...",
  },

  // Enable/disable plugins
  plugins: {
    enabled: true,
    // ...
  },

  // Configure messaging connectors
  connectors: {
    discord: {
      enabled: true,
      token: "...",
    }
  }
}
```

## Environment Variables

You can set environment variables in your system shell or in a `.env` file located in `~/.milaidy/.env`. These variables are often used for API keys and secrets.

### Common Variables

| Variable | Description |
|---|---|
| `MILAIDY_GATEWAY_PORT` | Port for the Gateway API (default: `18789`) |
| `MILAIDY_PORT` | Port for the Dashboard UI (default: `2138`) |
| `ANTHROPIC_API_KEY` | Key for Claude models |
| `OPENAI_API_KEY` | Key for GPT models |
| `OPENROUTER_API_KEY` | Key for OpenRouter |
| `GOOGLE_API_KEY` | Key for Gemini models |
| `XAI_API_KEY` | Key for Grok models |
| `GROQ_API_KEY` | Key for Groq inference |
| `DEEPSEEK_API_KEY` | Key for DeepSeek models |
| `EVM_PRIVATE_KEY` | Private key for EVM wallets |
| `SOLANA_PRIVATE_KEY` | Private key for Solana wallets |

## Models

Milaidy supports multiple AI providers. You can configure the default model in `milaidy.json`:

```json5
{
  models: {
    // Set the default model for chat
    default: "anthropic/claude-3-opus-20240229",

    // Configure provider specifics
    openai: {
      apiKey: "sk-...", // Or use env var
    },
    anthropic: {
      apiKey: "sk-ant-...",
    },
    ollama: {
      baseUrl: "http://localhost:11434", // Default for local Ollama
      model: "llama3",
    }
  }
}
```

### Local Models (Ollama)

To use local models without an API key:
1.  Install [Ollama](https://ollama.ai/).
2.  Pull a model: `ollama pull llama3`.
3.  Set the model in `milaidy.json` or select it during onboarding.

## Agents & Personality

The `agents` section defines your AI persona.

```json5
{
  agents: {
    list: [
      {
        id: "default-agent",
        name: "Milaidy",
        username: "milaidy_ai",
        bio: [
          "I am a helpful AI assistant.",
          "I enjoy coding and solving problems."
        ],
        topics: ["tech", "science", "art"],
        style: {
          all: ["be concise", "use emojis sparingly"],
          chat: ["be friendly"],
          post: ["be professional"]
        }
      }
    ]
  }
}
```

- **bio**: A list of sentences describing the agent's background.
- **topics**: Subjects the agent is knowledgeable about.
- **style**: Directives for how the agent should speak.

## Wallet Setup (Web3)

Milaidy has built-in support for EVM and Solana wallets.

### Auto-generated Wallets
On first run, Milaidy generates fresh wallets and stores them securely in your config.

### Custom Wallets
To use your own wallets, set the private keys in your environment variables:

```bash
# EVM (Ethereum, Base, Arbitrum, Optimism, Polygon)
export EVM_PRIVATE_KEY="0x..."

# Solana (base58-encoded)
export SOLANA_PRIVATE_KEY="..."
```

### Portfolio Tracking
To view token balances and NFTs in the dashboard, you need API keys for data providers:

```bash
# EVM Data (Alchemy)
export ALCHEMY_API_KEY="..."

# Solana Data (Helius)
export HELIUS_API_KEY="..."
```

## Connectors (Messaging)

Connect Milaidy to external platforms via the `connectors` section.

```json5
{
  connectors: {
    discord: {
      enabled: true,
      token: "YOUR_DISCORD_BOT_TOKEN",
      applicationId: "YOUR_APP_ID" // Optional
    },
    telegram: {
      enabled: true,
      token: "YOUR_TELEGRAM_BOT_TOKEN"
    },
    twitter: {
      enabled: true,
      username: "...",
      password: "...",
      email: "..."
    }
    // Other supported: whatsapp, slack, signal, etc.
  }
}
```

## Plugins

Plugins extend Milaidy's capabilities.

```json5
{
  plugins: {
    enabled: true,
    allow: ["@elizaos/plugin-weather", "@elizaos/plugin-crypto"],
    deny: ["@elizaos/plugin-nsfw"], // Block specific plugins
  }
}
```

You can list available plugins with `milaidy plugins list`.

## Gateway & Network

Configure the server settings in the `gateway` section.

```json5
{
  gateway: {
    port: 18789,
    mode: "local", // 'local' (localhost only) or 'remote' (accessible via network)
    auth: {
      mode: "token", // Require a token for API access
      token: "secret-token-..."
    }
  }
}
```

## UI Customization

Customize the look of the dashboard.

```json5
{
  ui: {
    seamColor: "#ff00ff", // Accent color
    assistant: {
      name: "My Assistant",
      avatar: "https://example.com/avatar.png"
    }
  }
}
```
