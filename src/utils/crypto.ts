import { createHash, timingSafeEqual } from "node:crypto";

/** Constant-time string comparison via SHA-256 digests (equal length). */
export function safeEqual(left: string, right: string): boolean {
  const leftDigest = createHash("sha256").update(left).digest();
  const rightDigest = createHash("sha256").update(right).digest();
  return timingSafeEqual(leftDigest, rightDigest);
}
