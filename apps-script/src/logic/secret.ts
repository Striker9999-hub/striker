export const MIN_SECRET_LENGTH = 32;

/** 64 hex chars (two v4 UUIDs, ~244 random bits). */
export function secretFromUuids(a: string, b: string): string {
  const secret = `${a}${b}`.replace(/-/g, "").toLowerCase();
  if (!/^[0-9a-f]+$/.test(secret) || secret.length < MIN_SECRET_LENGTH) throw new Error("weak_secret");
  return secret;
}

/**
 * Constant-time comparison (time depends only on the stored length). A
 * missing or short stored secret never matches, so an unconfigured script
 * rejects everything.
 */
export function secretsMatch(given: unknown, stored: unknown): boolean {
  if (typeof given !== "string" || typeof stored !== "string") return false;
  if (stored.length < MIN_SECRET_LENGTH) return false;
  let diff = given.length ^ stored.length;
  for (let i = 0; i < stored.length; i++) {
    diff |= (given.charCodeAt(i) || 0) ^ stored.charCodeAt(i);
  }
  return diff === 0;
}
