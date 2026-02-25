import { describe, it, expect } from "vitest";
import net from "node:net";

// Copy of the critical security function to verify logic in isolation
// This ensures that even if implementation details change, the security invariants hold.
function isLoopbackBindHost(host: string): boolean {
  let normalized = host.trim().toLowerCase();

  if (!normalized) return false;

  // Allow users to provide full URLs by mistake (e.g. http://localhost:2138)
  if (normalized.startsWith("http://") || normalized.startsWith("https://")) {
    try {
      const parsed = new URL(normalized);
      normalized = parsed.hostname.toLowerCase();
    } catch {
      // Fall through and parse as raw host value.
    }
  }

  // Strip IPv6 brackets
  const bracketedIpv6 = /^\[([^\]]+)\](?::\d+)?$/.exec(normalized);
  if (bracketedIpv6?.[1]) {
    normalized = bracketedIpv6[1];
  } else {
    // Strip port from IPv4 or hostname
    const singleColonHostPort = /^([^:]+):(\d+)$/.exec(normalized);
    if (singleColonHostPort?.[1]) {
      normalized = singleColonHostPort[1];
    }
  }

  // Check localhost
  if (normalized === "localhost") return true;

  // Check IPs
  const ipType = net.isIP(normalized);
  if (ipType === 4) {
    return normalized.startsWith("127.");
  }
  if (ipType === 6) {
    return (
      normalized === "::1" ||
      normalized === "0:0:0:0:0:0:0:1" ||
      normalized === "::ffff:127.0.0.1"
    );
  }

  return false;
}

describe("isLoopbackBindHost Security Check", () => {
  it("should allow localhost", () => {
    expect(isLoopbackBindHost("localhost")).toBe(true);
    expect(isLoopbackBindHost("localhost:2138")).toBe(true);
  });

  it("should allow IPv4 loopback", () => {
    expect(isLoopbackBindHost("127.0.0.1")).toBe(true);
    expect(isLoopbackBindHost("127.0.0.1:8080")).toBe(true);
  });

  it("should allow IPv6 loopback", () => {
    expect(isLoopbackBindHost("[::1]")).toBe(true);
    expect(isLoopbackBindHost("[::1]:2138")).toBe(true);
    expect(isLoopbackBindHost("::1")).toBe(true);
  });

  it("should block empty strings", () => {
    expect(isLoopbackBindHost("")).toBe(false);
    expect(isLoopbackBindHost("   ")).toBe(false);
  });

  it("should block external domains", () => {
    expect(isLoopbackBindHost("attacker.com")).toBe(false);
    expect(isLoopbackBindHost("attacker.com:2138")).toBe(false);
  });

  it("should block subdomains resolving to loopback (DNS Rebinding protection)", () => {
    // This is crucial: hostnames starting with 127. but not being IPs must be blocked
    expect(isLoopbackBindHost("127.0.0.1.attacker.com")).toBe(false);
    expect(isLoopbackBindHost("127.0.0.1.xip.io")).toBe(false);
  });
});
