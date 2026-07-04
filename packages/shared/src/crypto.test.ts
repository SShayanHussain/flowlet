import { describe, it, expect, beforeAll } from "vitest";
import { encryptSecret, decryptSecret, encryptCredentials, decryptCredentials } from "./crypto";

describe("credential encryption (AES-256-GCM)", () => {
  beforeAll(() => {
    process.env.CREDENTIALS_ENC_KEY = "test-credentials-key-please-change-me";
  });

  it("round-trips a secret", () => {
    const enc = encryptSecret("super-secret-api-token");
    expect(enc).not.toContain("super-secret");
    expect(decryptSecret(enc)).toBe("super-secret-api-token");
  });

  it("produces a different ciphertext each time (random IV)", () => {
    expect(encryptSecret("x")).not.toBe(encryptSecret("x"));
  });

  it("round-trips structured credentials", () => {
    const creds = { apiKey: "abc123", region: "us-east-1" };
    expect(decryptCredentials(encryptCredentials(creds))).toEqual(creds);
  });

  it("rejects a tampered ciphertext (auth tag fails)", () => {
    const enc = encryptSecret("tamper-me");
    const buf = Buffer.from(enc, "base64");
    buf[buf.length - 1] ^= 0xff; // flip a ciphertext bit
    expect(() => decryptSecret(buf.toString("base64"))).toThrow();
  });
});
