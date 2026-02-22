
import { describe, it, expect, vi } from "vitest";
import { parseTweetUrl } from "./twitter-verify";

vi.mock("@elizaos/core", () => ({
  logger: {
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe("parseTweetUrl Security", () => {
  it("should accept valid twitter URLs", () => {
    const url = "https://twitter.com/user/status/1234567890";
    const result = parseTweetUrl(url);
    expect(result).toEqual({ screenName: "user", tweetId: "1234567890" });
  });

  it("should NOT accept URLs with prefix (unanchored regex issue)", () => {
    const url = "https://evil.com/twitter.com/user/status/1234567890";
    const result = parseTweetUrl(url);
    expect(result).toBeNull();
  });

  it("should accept x.com URLs", () => {
    const url = "https://x.com/user/status/1234567890";
    const result = parseTweetUrl(url);
    expect(result).toEqual({ screenName: "user", tweetId: "1234567890" });
  });

  it("should accept www.twitter.com URLs", () => {
    const url = "https://www.twitter.com/user/status/1234567890";
    const result = parseTweetUrl(url);
    expect(result).toEqual({ screenName: "user", tweetId: "1234567890" });
  });

  it("should NOT accept invalid paths", () => {
    const url = "https://twitter.com/user/1234567890";
    const result = parseTweetUrl(url);
    expect(result).toBeNull();
  });

  it("should NOT accept path traversal attempts", () => {
    const url = "https://twitter.com/user/status/123/../../something";
    const result = parseTweetUrl(url);
    expect(result).toBeNull();
  });
});
