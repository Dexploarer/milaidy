# Development Guide

This guide is for developers who want to contribute to Milaidy or build it from source.

## Prerequisites

- **Node.js**: Version 22 or higher.
- **Bun**: Required for dependency management and building (`npm install -g bun`).
- **Git**: For version control.

## Setup

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/milady-ai/milaidy.git
    cd milaidy
    ```

2.  **Install dependencies:**
    ```bash
    bun install
    ```

3.  **Build the project:**
    ```bash
    bun run build
    ```
    This builds the TypeScript source (via `tsdown`) and the UI (React).

4.  **Run in development mode:**
    ```bash
    bun run dev
    ```
    This starts the agent with auto-reloading on file changes.

## Project Structure

Milaidy is a monorepo structured as follows:

- **`src/`**: Core source code.
    - `src/runtime/`: The ElizaOS runtime integration.
    - `src/cli/`: Command-line interface logic.
    - `src/config/`: Configuration schemas and parsers.
    - `src/providers/`: Data providers.
    - `src/utils/`: Utility functions.
- **`apps/`**: Client applications.
    - `apps/app/`: The Electron/Capacitor app (Desktop & Mobile).
    - `apps/chrome-extension/`: Browser extension.
- **`packages/`**: Shared packages.
- **`scripts/`**: Build and release scripts.
- **`test/`**: Test setup and helpers.

## Commands

| Command | Description |
|---|---|
| `bun run build` | Builds the entire project (backend + frontend). |
| `bun run check` | Runs linting and formatting checks (Biome). |
| `bun run test` | Runs unit tests. |
| `bun run test:e2e` | Runs end-to-end tests. |
| `bun run milaidy ...` | Runs the CLI directly from source. |

## Coding Guidelines

- **Language**: TypeScript (ESM). strict mode is enabled.
- **Style**: We use [Biome](https://biomejs.dev/) for formatting and linting. Run `bun run check` before committing.
- **Testing**: Write tests for all new features. We use Vitest.
    - Colocate unit tests with source files (`*.test.ts`).
    - Keep test files focused and fast.

## ElizaOS Integration

Milaidy is built on top of [ElizaOS](https://github.com/elizaos). However, due to the rapid development of ElizaOS, we employ a strict version pinning strategy to ensure stability.

We pin specific versions of `@elizaos/core` and plugins to avoid breaking changes in alpha releases.

For more details on our versioning strategy and how to update dependencies, please read:
[**ElizaOS Versioning Strategy**](./ELIZAOS_VERSIONING.md)
