import { describe, it, expect } from "vitest";
import { redactConfigSecrets, SENSITIVE_KEY_RE } from "./redaction.js";

describe("redactConfigSecrets", () => {
  it("should redact sensitive keys at the root level", () => {
    const config = {
      apiKey: "secret-key",
      password: "my-password",
      publicData: "visible",
    };
    const redacted = redactConfigSecrets(config);
    expect(redacted).toEqual({
      apiKey: "[REDACTED]",
      password: "[REDACTED]",
      publicData: "visible",
    });
  });

  it("should redact sensitive keys in nested objects", () => {
    const config = {
      service: {
        api_key: "nested-secret",
        timeout: 1000,
      },
    };
    const redacted = redactConfigSecrets(config);
    expect(redacted).toEqual({
      service: {
        api_key: "[REDACTED]",
        timeout: 1000,
      },
    });
  });

  it("should redact entire objects under sensitive keys", () => {
    const config = {
      credentials: {
        user: "admin",
        pass: "secret",
      },
    };
    const redacted = redactConfigSecrets(config);
    expect(redacted).toEqual({
      credentials: {
        user: "[REDACTED]",
        pass: "[REDACTED]",
      },
    });
  });

  it("should redact arrays under sensitive keys", () => {
    const config = {
      apiKeys: ["key1", "key2"],
    };
    const redacted = redactConfigSecrets(config);
    expect(redacted).toEqual({
      apiKeys: ["[REDACTED]", "[REDACTED]"],
    });
  });

  it("should preserve non-sensitive data", () => {
    const config = {
      name: "Milaidy",
      version: 1,
      features: ["a", "b"],
    };
    const redacted = redactConfigSecrets(config);
    expect(redacted).toEqual(config);
  });

  it("should match known sensitive patterns", () => {
    expect(SENSITIVE_KEY_RE.test("apiKey")).toBe(true);
    expect(SENSITIVE_KEY_RE.test("password")).toBe(true);
    expect(SENSITIVE_KEY_RE.test("secret")).toBe(true);
    expect(SENSITIVE_KEY_RE.test("privateKey")).toBe(true);
    expect(SENSITIVE_KEY_RE.test("connectionString")).toBe(true);
    expect(SENSITIVE_KEY_RE.test("token")).toBe(true);
    expect(SENSITIVE_KEY_RE.test("maxTokens")).toBe(false); // Negative lookbehind test
  });
});
