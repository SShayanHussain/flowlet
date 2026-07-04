import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

// AES-256-GCM encryption for connection credentials at rest (CLAUDE.md hard rule).
// Stored form: base64( iv(12) || authTag(16) || ciphertext ).
//
// The 32-byte key is derived from CREDENTIALS_ENC_KEY via SHA-256 so any configured
// secret string yields a valid key length (entropy comes from the configured secret).
const IV_LEN = 12;
const TAG_LEN = 16;

function key(): Buffer {
  const secret = process.env.CREDENTIALS_ENC_KEY;
  if (!secret) throw new Error("Missing env var: CREDENTIALS_ENC_KEY");
  return createHash("sha256").update(secret).digest();
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString("base64");
}

export function decryptSecret(payload: string): string {
  const buf = Buffer.from(payload, "base64");
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const ciphertext = buf.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

/** Convenience for structured credential objects. */
export function encryptCredentials(creds: Record<string, unknown>): string {
  return encryptSecret(JSON.stringify(creds));
}

export function decryptCredentials(payload: string): Record<string, unknown> {
  return JSON.parse(decryptSecret(payload));
}
