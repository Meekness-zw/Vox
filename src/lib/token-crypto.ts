import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * AES-256-GCM encryption for secrets stored at rest (Google Calendar refresh
 * tokens). Key is derived from TOKEN_ENCRYPTION_KEY so any passphrase length
 * works. A DB leak alone should not hand out live calendar access.
 */
function getKey(): Buffer {
  const secret = process.env.TOKEN_ENCRYPTION_KEY;
  if (!secret) throw new Error("TOKEN_ENCRYPTION_KEY is not set");
  return createHash("sha256").update(secret).digest();
}

export function hasEncryptionKey() {
  return Boolean(process.env.TOKEN_ENCRYPTION_KEY);
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, encrypted].map((b) => b.toString("base64")).join(".");
}

export function decryptSecret(payload: string): string {
  const [ivB64, tagB64, encB64] = payload.split(".");
  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const encrypted = Buffer.from(encB64, "base64");
  const decipher = createDecipheriv("aes-256-gcm", getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}
