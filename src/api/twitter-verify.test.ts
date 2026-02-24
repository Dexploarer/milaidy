import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  generateVerificationMessage,
  getVerifiedAddresses,
  isAddressWhitelisted,
  loadWhitelist,
  markAddressVerified,
  verifyTweet,
} from "./twitter-verify";

const WALLET = "0x1234567890abcdef1234567890abcdef12345678";
const VALID_TWEET_URL = "https://x.com/miladyai/status/1234567890";

function mockFetchResponse(params: {
  ok: boolean;
  status: number;
  body?: unknown;
  jsonReject?: boolean;
}) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: params.ok,
    status: params.status,
    json: params.jsonReject
      ? vi.fn().mockRejectedValue(new Error("invalid json"))
      : vi.fn().mockResolvedValue(params.body),
  } as unknown as Response);

  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("twitter-verify", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  // ── generateVerificationMessage ─────────────────────────────────────

  describe("generateVerificationMessage", () => {
    it.each([
      {
        agent: "Milady",
        wallet: "0xAbCdEf1234567890AbCdEf1234567890AbCdEf12",
        expected:
          'Verifying my Milady agent "Milady" | 0xAbCd...Ef12 #MiladyAgent',
      },
      {
        agent: "TestBot",
        wallet: "0x0000000000000000000000000000000000000000",
        expected:
          'Verifying my Milady agent "TestBot" | 0x0000...0000 #MiladyAgent',
      },
      {
        agent: "",
        wallet: "0x1111111111111111111111111111111111111111",
        expected: 'Verifying my Milady agent "" | 0x1111...1111 #MiladyAgent',
      },
    ])("formats message for agent=$agent wallet=$wallet", ({
      agent,
      wallet,
      expected,
    }) => {
      expect(generateVerificationMessage(agent, wallet)).toBe(expected);
    });
  });

  // ── URL parsing (table-driven) ──────────────────────────────────────

  describe("parseTweetUrl (via verifyTweet)", () => {
    it.each([
      { url: "https://example.com/not-twitter", label: "wrong domain" },
      { url: "https://x.com/miladyai/post/123", label: "wrong path segment" },
      {
        url: "https://twitter.com/miladyai/status/not-a-number",
        label: "non-numeric status ID",
      },
      { url: "", label: "empty string" },
      { url: "https://x.com//status/123", label: "missing screen name" },
    ])("rejects invalid URL ($label): $url", async ({ url }) => {
      const result = await verifyTweet(url, WALLET);
      expect(result).toEqual({
        verified: false,
        error: "Invalid tweet URL. Use a twitter.com or x.com status URL.",
        handle: null,
      });
    });

    it.each([
      {
        url: "https://x.com/miladyai/status/1234567890",
        expectedApi: "https://api.fxtwitter.com/miladyai/status/1234567890",
        label: "x.com URL",
      },
      {
        url: "https://twitter.com/miladyai/status/9876543210",
        expectedApi: "https://api.fxtwitter.com/miladyai/status/9876543210",
        label: "twitter.com URL",
      },
      {
        url: "https://x.com/user_name/status/111",
        expectedApi: "https://api.fxtwitter.com/user_name/status/111",
        label: "underscore in screen name",
      },
    ])("parses valid URL ($label) and calls correct API", async ({
      url,
      expectedApi,
    }) => {
      const fetchMock = mockFetchResponse({
        ok: true,
        status: 200,
        body: {
          tweet: {
            text: `0x1234...5678 #MiladyAgent`,
            author: { screen_name: "miladyai" },
          },
        },
      });

      await verifyTweet(url, WALLET);

      expect(fetchMock).toHaveBeenCalledWith(
        expectedApi,
        expect.objectContaining({
          headers: { "User-Agent": "MiladyVerifier/1.0" },
        }),
      );
    });
  });

  // ── Fetch / timeout failures (table-driven) ────────────────────────

  describe("fetch failures", () => {
    it.each([
      { error: new Error("network timeout"), label: "network timeout" },
      {
        error: new TypeError("Failed to fetch"),
        label: "TypeError fetch failure",
      },
      {
        error: new DOMException("The operation was aborted", "AbortError"),
        label: "AbortError (timeout)",
      },
    ])("returns retry message on $label", async ({ error }) => {
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(error));

      const result = await verifyTweet(VALID_TWEET_URL, WALLET);

      expect(result).toEqual({
        verified: false,
        error: "Could not reach tweet verification service. Try again later.",
        handle: null,
      });
    });

    it.each([
      {
        status: 404,
        expected:
          "Tweet not found. Make sure the URL is correct and the tweet is public.",
        label: "404",
      },
      { status: 500, expected: "Tweet fetch failed (HTTP 500)", label: "500" },
      { status: 503, expected: "Tweet fetch failed (HTTP 503)", label: "503" },
      {
        status: 429,
        expected: "Tweet fetch failed (HTTP 429)",
        label: "429 rate-limit",
      },
    ])("maps HTTP $label to appropriate error", async ({
      status,
      expected,
    }) => {
      mockFetchResponse({ ok: false, status });

      const result = await verifyTweet(VALID_TWEET_URL, WALLET);

      expect(result).toEqual({
        verified: false,
        error: expected,
        handle: null,
      });
    });

    it("handles invalid JSON from verification service", async () => {
      mockFetchResponse({ ok: true, status: 200, jsonReject: true });

      const result = await verifyTweet(VALID_TWEET_URL, WALLET);

      expect(result).toEqual({
        verified: false,
        error: "Invalid response from verification service",
        handle: null,
      });
    });

    it("fails when tweet object has no text field", async () => {
      mockFetchResponse({ ok: true, status: 200, body: { tweet: {} } });

      const result = await verifyTweet(VALID_TWEET_URL, WALLET);

      expect(result).toEqual({
        verified: false,
        error: "Could not read tweet content",
        handle: null,
      });
    });

    it("fails when response has no tweet object at all", async () => {
      mockFetchResponse({ ok: true, status: 200, body: {} });

      const result = await verifyTweet(VALID_TWEET_URL, WALLET);

      expect(result).toEqual({
        verified: false,
        error: "Could not read tweet content",
        handle: null,
      });
    });
  });

  // ── Message mismatch (table-driven) ────────────────────────────────

  describe("message mismatch", () => {
    it.each([
      {
        text: "Verifying my Milady agent #MiladyAgent",
        label: "no wallet address at all",
      },
      {
        text: "Random tweet with #MiladyAgent but wrong address 0xDEAD...BEEF",
        label: "wrong short address",
      },
      {
        text: "#MiladyAgent 0xFFFF567890abcdef",
        label: "wrong address prefix (no partial match)",
      },
    ])("rejects tweet missing wallet evidence ($label)", async ({ text }) => {
      mockFetchResponse({
        ok: true,
        status: 200,
        body: { tweet: { text, author: { screen_name: "user1" } } },
      });

      const result = await verifyTweet(VALID_TWEET_URL, WALLET);

      expect(result).toEqual({
        verified: false,
        error:
          "Tweet does not contain your wallet address. Make sure you copied the full verification message.",
        handle: "user1",
      });
    });

    it.each([
      {
        text: "Verifying wallet 0x1234...5678 without hashtag",
        label: "short address present but no hashtag",
      },
      {
        text: "0x1234567890 partial address present, no tag",
        label: "partial address present but no hashtag",
      },
    ])("rejects tweet missing hashtag ($label)", async ({ text }) => {
      mockFetchResponse({
        ok: true,
        status: 200,
        body: { tweet: { text, author: { screen_name: "user2" } } },
      });

      const result = await verifyTweet(VALID_TWEET_URL, WALLET);

      expect(result).toEqual({
        verified: false,
        error: "Tweet is missing #MiladyAgent hashtag.",
        handle: "user2",
      });
    });
  });

  // ── Successful verification paths ──────────────────────────────────

  describe("successful verification", () => {
    it("verifies via short address format (0x1234...5678)", async () => {
      const fetchMock = mockFetchResponse({
        ok: true,
        status: 200,
        body: {
          tweet: {
            text: 'Verifying my Milady agent "Milady" | 0x1234...5678 #MiladyAgent',
            author: { screen_name: "miladyai" },
          },
        },
      });

      const result = await verifyTweet(VALID_TWEET_URL, WALLET);

      expect(result).toEqual({
        verified: true,
        error: null,
        handle: "miladyai",
      });
      expect(fetchMock).toHaveBeenCalledWith(
        "https://api.fxtwitter.com/miladyai/status/1234567890",
        expect.objectContaining({
          headers: { "User-Agent": "MiladyVerifier/1.0" },
        }),
      );
    });

    it("verifies via partial address prefix (first 10 chars)", async () => {
      mockFetchResponse({
        ok: true,
        status: 200,
        body: {
          tweet: {
            text: "Check out 0x12345678 something #MiladyAgent",
            author: { screen_name: "altuser" },
          },
        },
      });

      // walletAddress.toLowerCase().slice(0, 10) = "0x12345678"
      const result = await verifyTweet(VALID_TWEET_URL, WALLET);

      expect(result).toEqual({
        verified: true,
        error: null,
        handle: "altuser",
      });
    });

    it("falls back to screen name from URL when author.screen_name is absent", async () => {
      mockFetchResponse({
        ok: true,
        status: 200,
        body: {
          tweet: {
            text: "0x1234...5678 #MiladyAgent",
            author: {},
          },
        },
      });

      const result = await verifyTweet(
        "https://x.com/urluser/status/999",
        WALLET,
      );

      expect(result).toEqual({
        verified: true,
        error: null,
        handle: "urluser",
      });
    });

    it("address matching is case-insensitive", async () => {
      mockFetchResponse({
        ok: true,
        status: 200,
        body: {
          tweet: {
            text: "0X12345678 uppercase prefix #MiladyAgent",
            author: { screen_name: "caseuser" },
          },
        },
      });

      const result = await verifyTweet(VALID_TWEET_URL, WALLET);

      expect(result).toEqual({
        verified: true,
        error: null,
        handle: "caseuser",
      });
    });
  });
});

// ── Whitelist storage (table-driven) ──────────────────────────────────

describe("whitelist storage", () => {
  let tmpDir: string;
  const origEnv = process.env.MILADY_STATE_DIR;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "milady-wl-"));
    process.env.MILADY_STATE_DIR = tmpDir;
  });

  afterEach(() => {
    if (origEnv === undefined) delete process.env.MILADY_STATE_DIR;
    else process.env.MILADY_STATE_DIR = origEnv;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("loadWhitelist", () => {
    it("returns empty verified map when file does not exist", () => {
      const wl = loadWhitelist();
      expect(wl).toEqual({ verified: {} });
    });

    it("returns parsed data when file exists", () => {
      const data = {
        verified: {
          "0xabc": {
            timestamp: "2026-01-01T00:00:00.000Z",
            tweetUrl: "https://x.com/u/status/1",
            handle: "testuser",
          },
        },
      };
      fs.writeFileSync(
        path.join(tmpDir, "whitelist.json"),
        JSON.stringify(data),
      );

      const wl = loadWhitelist();
      expect(wl).toEqual(data);
    });
  });

  describe("markAddressVerified", () => {
    it("creates whitelist file and stores entry with lowercase address", () => {
      markAddressVerified(
        "0xABCDef1234567890ABCDef1234567890ABCDef12",
        "https://x.com/user1/status/100",
        "user1",
      );

      const wl = loadWhitelist();
      const key = "0xabcdef1234567890abcdef1234567890abcdef12";
      expect(wl.verified[key]).toBeDefined();
      expect(wl.verified[key].tweetUrl).toBe("https://x.com/user1/status/100");
      expect(wl.verified[key].handle).toBe("user1");
      expect(wl.verified[key].timestamp).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
      );
    });

    it("appends to existing whitelist without overwriting", () => {
      markAddressVerified("0xAAAA", "https://x.com/a/status/1", "userA");
      markAddressVerified("0xBBBB", "https://x.com/b/status/2", "userB");

      const wl = loadWhitelist();
      expect(Object.keys(wl.verified)).toHaveLength(2);
      expect(wl.verified["0xaaaa"]).toBeDefined();
      expect(wl.verified["0xbbbb"]).toBeDefined();
    });

    it("overwrites entry for same address (case-insensitive)", () => {
      markAddressVerified("0xAAAA", "https://x.com/a/status/1", "old");
      markAddressVerified("0xaaaa", "https://x.com/a/status/2", "new");

      const wl = loadWhitelist();
      expect(Object.keys(wl.verified)).toHaveLength(1);
      expect(wl.verified["0xaaaa"].handle).toBe("new");
      expect(wl.verified["0xaaaa"].tweetUrl).toBe("https://x.com/a/status/2");
    });
  });

  describe("isAddressWhitelisted", () => {
    it.each([
      { input: "0xABCD", stored: "0xabcd", label: "uppercase input" },
      { input: "0xabcd", stored: "0xabcd", label: "lowercase input" },
      { input: "0xAbCd", stored: "0xabcd", label: "mixed case input" },
    ])("returns true for verified address ($label)", ({ input, stored }) => {
      markAddressVerified(stored, "https://x.com/u/status/1", "u");
      expect(isAddressWhitelisted(input)).toBe(true);
    });

    it("returns false for unverified address", () => {
      expect(isAddressWhitelisted("0xNOTVERIFIED")).toBe(false);
    });

    it("returns false when whitelist file does not exist", () => {
      expect(isAddressWhitelisted("0x1234")).toBe(false);
    });
  });

  describe("getVerifiedAddresses", () => {
    it("returns empty array when no addresses are verified", () => {
      expect(getVerifiedAddresses()).toEqual([]);
    });

    it("returns all verified addresses as lowercase keys", () => {
      markAddressVerified("0xAAAA", "https://x.com/a/status/1", "a");
      markAddressVerified("0xBBBB", "https://x.com/b/status/2", "b");

      const addresses = getVerifiedAddresses();
      expect(addresses).toHaveLength(2);
      expect(addresses).toContain("0xaaaa");
      expect(addresses).toContain("0xbbbb");
    });
  });
});
