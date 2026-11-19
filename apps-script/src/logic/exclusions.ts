import { isValidEmail, normalizeEmail } from "./email";

const DOMAIN_RE = /^@[a-z0-9-]+(\.[a-z0-9-]+)+$/;

/** An exclusion is a full address or "@domain.tld"; anything else is ignored. */
export function normalizeExclusion(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = normalizeEmail(value);
  if (DOMAIN_RE.test(v)) return v;
  if (isValidEmail(v)) return v;
  return null;
}

export function isExcluded(to: string, exclusions: readonly string[]): boolean {
  const addr = normalizeEmail(to);
  const domain = addr.slice(addr.lastIndexOf("@"));
  return exclusions.some((raw) => {
    const e = normalizeExclusion(raw);
    return e !== null && (e === addr || e === domain);
  });
}
