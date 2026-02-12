# Codebase Review: Milaidy

This document outlines architectural observations, code quality improvements, security considerations, and suggested refactoring steps for the Milaidy codebase.

## Architectural Observations

1.  **Monolithic Files:**
    *   `src/runtime/eliza.ts`: (~800 lines) Contains mixed responsibilities:
        *   Plugin resolution and loading logic.
        *   Configuration environment mapping.
        *   First-time onboarding CLI logic.
        *   Runtime initialization and chat loop.
    *   `src/api/server.ts`: (~2600 lines) Acts as a massive controller for all API endpoints.
        *   Contains ad-hoc routing logic (nested `if` statements).
        *   Mixes API handling with business logic (e.g., wallet generation, config persistence).

2.  **Lack of Routing Abstraction:**
    *   The API server uses a single `handleRequest` function with extensive conditional logic to route requests. This makes adding new routes error-prone and hard to maintain.

3.  **Code Duplication:**
    *   `readBody` / `readJsonBody` utility functions are duplicated across `src/api/server.ts` and `src/api/database.ts`.
    *   Database connection string logic is duplicated in `src/runtime/eliza.ts` (environment mapping) and `src/api/database.ts`.

## Security Considerations

1.  **Raw SQL Exposure:**
    *   `src/api/database.ts` exposes a raw SQL query endpoint (`/api/database/query`). While it attempts to filter mutation keywords via regex, this approach is inherently risky and can potentially be bypassed. Consider restricting this endpoint to read-only operations or removing it entirely for production environments.

2.  **Authentication Implementation:**
    *   Authentication checks (`isAuthorized`) are implemented manually within the request handler.
    *   Token comparison logic uses `crypto.timingSafeEqual` (good!), but the extraction logic is duplicated.
    *   Consider moving authentication to a centralized middleware.

3.  **Sensitive Data Handling:**
    *   Password masking in API responses (e.g., in `src/api/database.ts`) relies on manual string replacement or simple redaction functions. Ensure robust handling for all sensitive fields.

## Suggested Refactoring

### 1. Extract Onboarding Logic
Move the CLI onboarding logic (`runFirstTimeSetup`) from `src/runtime/eliza.ts` to a dedicated module, e.g., `src/runtime/onboarding.ts`. This will improve readability and separate concerns.

### 2. Modularize API Server
Refactor `src/api/server.ts` to use a router pattern.
*   Create a `src/api/routes/` directory.
*   Group handlers by domain (e.g., `auth.ts`, `agent.ts`, `skills.ts`).
*   Implement a simple router or use a lightweight framework (e.g., `h3` or similar, if dependencies allow) to dispatch requests.

### 3. Centralize Configuration Constants
Move hardcoded lists (e.g., `CORE_PLUGINS`, `PROVIDER_PLUGIN_MAP`) from `src/runtime/eliza.ts` to a configuration file or constants module (e.g., `src/config/constants.ts`).

### 4. Improve Utility Functions
*   Centralize HTTP helpers (`readJsonBody`, `errorResponse`) in `src/api/utils.ts`.
*   Centralize database connection helpers in `src/services/database-utils.ts`.

## Code Quality

*   **Type Safety:** The codebase generally uses TypeScript well, but explicit types for API request/response bodies could be more consistent.
*   **Error Handling:** Ensure all promises are caught and errors are logged with sufficient context. Avoid swallowing errors in `catch` blocks without logging.
