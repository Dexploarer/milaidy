## 2024-05-24 - [Insecure Randomness in Terminal Process ID]
**Vulnerability:** The `runId` for spawned background terminal processes was generated using `Math.random().toString(36)` instead of a cryptographically secure random number generator.
**Learning:** A predictable `runId` allows attackers sharing the same WebSocket stream to spoof terminal output events or prematurely terminate streams if they guess the ID before the actual process completes.
**Prevention:** Always use `crypto.randomUUID()` or `crypto.randomBytes()` for generating security-sensitive identifiers, especially those used for routing or event broadcasting over shared channels.
