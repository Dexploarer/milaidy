## 2024-02-18 - [Bun Test vs Vitest Compatibility]
**Learning:** `bun:test` syntax (e.g., `mock.module`, `import ... from "bun:test"`) is incompatible with `vitest`, which is the project's standard test runner. Tests written using `bun:test` will fail in CI/CD pipelines.
**Action:** Always write tests using `vitest` syntax (`vi.mock`, `vi.fn`, `import ... from "vitest"`) to ensure compatibility, even if local verification requires workarounds.

## 2024-02-18 - [Node.js Response Request Access]
**Learning:** The `http.ServerResponse` object in Node.js has a circular reference to the request object (`req`) at runtime, but this is not exposed in the standard `@types/node` definitions.
**Action:** To access request headers from a response object (e.g., for content negotiation), cast the response to `{ req: http.IncomingMessage }` and use optional chaining (`res.req?.headers`) to handle cases where the request object might be missing (e.g., in unit tests).
