import { scryptSync, randomBytes, timingSafeEqual } from "node:crypto";

/** Hash a password with scrypt + per-password random salt. */
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const derived = scryptSync(password, salt, 64);
  const hashBuf = Buffer.from(hash, "hex");
  return (
    derived.length === hashBuf.length && timingSafeEqual(derived, hashBuf)
  );
}
