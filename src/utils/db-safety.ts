import dns from "node:dns";
import { promisify } from "node:util";
import type { PostgresCredentials } from "../config/types.milaidy.js";

const dnsLookupAll = promisify(dns.lookup);

/**
 * IP ranges that are ALWAYS blocked regardless of bind address.
 * Cloud metadata and "this" network are never legitimate Postgres targets.
 */
const ALWAYS_BLOCKED_IP_PATTERNS: RegExp[] = [
  /^169\.254\./, // Link-local / cloud metadata (AWS, GCP, Azure)
  /^0\./, // "This" network
  /^fe80:/i, // IPv6 link-local
];

/**
 * Private/internal IP ranges — blocked only when the API is bound to a
 * non-loopback address (i.e. remotely reachable).  When bound to 127.0.0.1
 * (the default), these are allowed since local Postgres is the most common
 * setup and an attacker who can reach the loopback API already has local
 * network access.
 */
const PRIVATE_IP_PATTERNS: RegExp[] = [
  /^127\./, // IPv4 loopback
  /^10\./, // RFC 1918 Class A
  /^172\.(1[6-9]|2\d|3[01])\./, // RFC 1918 Class B
  /^192\.168\./, // RFC 1918 Class C
  /^::1$/, // IPv6 loopback
  /^fc00:/i, // IPv6 ULA
];

/**
 * Returns true when the API server is bound to a loopback-only address.
 * In that case, private/internal IP ranges are allowed for DB connections
 * since only local processes can reach the API.
 */
function isApiLoopbackOnly(): boolean {
  const bind =
    (process.env.MILAIDY_API_BIND ?? "127.0.0.1").trim() || "127.0.0.1";
  return (
    bind === "127.0.0.1" || bind === "::1" || bind.toLowerCase() === "localhost"
  );
}

/**
 * Extract the host from a Postgres connection string or credentials object.
 * Returns `null` if no host can be determined.
 */
export function extractHost(creds: PostgresCredentials): string | null {
  if (creds.connectionString) {
    try {
      const url = new URL(creds.connectionString);
      return url.hostname || null;
    } catch {
      return null; // Unparseable — will be rejected
    }
  }
  return creds.host ?? null;
}

/**
 * Check whether an IP address falls in a blocked range.
 * When the API is remotely reachable, private ranges are also blocked.
 */
function isBlockedIp(ip: string): boolean {
  if (ALWAYS_BLOCKED_IP_PATTERNS.some((p) => p.test(ip))) return true;
  if (!isApiLoopbackOnly() && PRIVATE_IP_PATTERNS.some((p) => p.test(ip)))
    return true;
  return false;
}

/**
 * Validate that the target host does not resolve to a blocked address.
 *
 * Performs DNS resolution to catch hostnames like `metadata.google.internal`
 * or `169.254.169.254.nip.io` that resolve to link-local / cloud metadata
 * IPs.  Also handles IPv6-mapped IPv4 addresses (e.g. `::ffff:169.254.x.y`).
 *
 * Returns an error message if blocked, or `null` if allowed.
 */
export async function validateDbHost(
  creds: PostgresCredentials,
): Promise<string | null> {
  const host = extractHost(creds);
  if (!host) {
    return "Could not determine target host from the provided credentials.";
  }

  // First check the literal host string (catches raw IPs without DNS lookup)
  if (isBlockedIp(host)) {
    return `Connection to "${host}" is blocked: link-local and metadata addresses are not allowed.`;
  }

  // Resolve DNS and check all resulting IPs
  try {
    const results = await dnsLookupAll(host, { all: true });
    const addresses = Array.isArray(results) ? results : [results];
    for (const entry of addresses) {
      const ip =
        typeof entry === "string"
          ? entry
          : (entry as { address: string }).address;
      // Strip IPv6-mapped IPv4 prefix (::ffff:169.254.x.y → 169.254.x.y)
      const normalized = ip.replace(/^::ffff:/i, "");
      if (isBlockedIp(normalized)) {
        return (
          `Connection to "${host}" is blocked: it resolves to ${ip} ` +
          `which is a link-local or metadata address.`
        );
      }
    }
  } catch {
    // DNS resolution failed — let the Postgres client handle the error
    // rather than blocking legitimate hostnames that may be temporarily
    // unresolvable from this context
  }

  return null;
}
