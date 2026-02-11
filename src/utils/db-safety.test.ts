import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import dns from "node:dns";

// Mock dns module
vi.mock("node:dns", async () => {
  const actual = await vi.importActual<typeof import("node:dns")>("node:dns");
  return {
    ...actual,
    default: {
      ...actual.default,
      lookup: vi.fn(),
    },
    lookup: vi.fn(), // Named export for some environments
  };
});

// Import the subject under test
import { validateDbHost, extractHost } from "./db-safety.js";

describe("db-safety", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("MILAIDY_API_BIND", "127.0.0.1"); // Default to loopback
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("extractHost", () => {
    it("extracts host from connection string", () => {
      expect(extractHost({ connectionString: "postgres://user:pass@example.com:5432/db" })).toBe("example.com");
    });

    it("extracts host from host param", () => {
      expect(extractHost({ host: "example.com" })).toBe("example.com");
    });

    it("returns null for invalid connection string", () => {
      expect(extractHost({ connectionString: "invalid-url" })).toBeNull();
    });

    it("returns null if no host provided", () => {
      expect(extractHost({})).toBeNull();
    });
  });

  describe("validateDbHost", () => {
    // Helper to mock DNS resolution
    const mockDns = (ip: string | string[]) => {
      const ips = Array.isArray(ip) ? ip : [ip];
      const addresses = ips.map(addr => ({ address: addr, family: 4 }));

      (dns.lookup as unknown as ReturnType<typeof vi.fn>).mockImplementation(
        (hostname, options, callback) => {
            // handle optional options arg
            if (typeof options === 'function') {
                callback = options;
                options = {};
            }
            // For { all: true }, callback is (err, addresses)
            if (options?.all) {
                callback(null, addresses);
            } else {
                // For single address, callback is (err, address, family)
                callback(null, addresses[0].address, addresses[0].family);
            }
        }
      );
    };

    it("allows public IPs", async () => {
      mockDns("8.8.8.8");
      const result = await validateDbHost({ host: "google.com" });
      expect(result).toBeNull();
    });

    it("blocks metadata IPs (169.254.x.x) directly", async () => {
      const result = await validateDbHost({ host: "169.254.169.254" });
      expect(result).toContain("blocked");
    });

    it("blocks metadata IPs via DNS", async () => {
      mockDns("169.254.169.254");
      const result = await validateDbHost({ host: "metadata.internal" });
      expect(result).toContain("blocked");
    });

    it("blocks 'this' network (0.x.x.x)", async () => {
       const result = await validateDbHost({ host: "0.0.0.0" });
       expect(result).toContain("blocked");
    });

    it("blocks IPv6 link-local (fe80::)", async () => {
       const result = await validateDbHost({ host: "fe80::1" });
       expect(result).toContain("blocked");
    });

    it("allows localhost when API is loopback only (default)", async () => {
       mockDns("127.0.0.1");
       const result = await validateDbHost({ host: "localhost" });
       expect(result).toBeNull();
    });

    it("allows private IPs when API is loopback only", async () => {
      mockDns("10.0.0.1");
      const result = await validateDbHost({ host: "internal.lan" });
      expect(result).toBeNull();
    });

    it("blocks private IPs when API is exposed remotely", async () => {
      vi.stubEnv("MILAIDY_API_BIND", "0.0.0.0");

      // Direct IP
      const result1 = await validateDbHost({ host: "10.0.0.1" });
      expect(result1).toContain("blocked");

      // DNS
      mockDns("192.168.1.50");
      const result2 = await validateDbHost({ host: "home.router" });
      expect(result2).toContain("blocked");
    });

    it("handles DNS resolution errors gracefully (allows them)", async () => {
       (dns.lookup as unknown as ReturnType<typeof vi.fn>).mockImplementation(
        (hostname, options, callback) => {
            if (typeof options === 'function') callback = options;
            callback(new Error("ENOTFOUND"));
        }
      );

      // Should not block if DNS fails (per logic in db-safety.ts)
      const result = await validateDbHost({ host: "nonexistent.host" });
      expect(result).toBeNull();
    });

    it("handles IPv6-mapped IPv4 addresses", async () => {
      // ::ffff:169.254.169.254
      mockDns("::ffff:169.254.169.254");
      const result = await validateDbHost({ host: "mapped.metadata" });
      expect(result).toContain("blocked");
    });
  });
});
