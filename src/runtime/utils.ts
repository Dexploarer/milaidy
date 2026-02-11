import * as clack from "@clack/prompts";
import process from "node:process";

/** Extract a human-readable error message from an unknown thrown value. */
export function formatError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Cancel the onboarding flow and exit cleanly.
 * Extracted to avoid duplicating the cancel+exit pattern 7 times.
 */
export function cancelOnboarding(): never {
  clack.cancel("Maybe next time!");
  process.exit(0);
}
