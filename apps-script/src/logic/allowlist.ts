import { isValidEmail, normalizeEmail } from "./email";

/** DEV_MODE is on unless the cell says FALSE (fail safe: blank or typo = on). */
export function isDevModeOn(value: unknown): boolean {
  if (value === false) return false;
  return !(typeof value === "string" && value.trim().toUpperCase() === "FALSE");
}

export function parseAllowlist(value: unknown): Set<string> {
  if (typeof value !== "string") return new Set();
  return new Set(
    value
      .split(/[\s,;]+/)
      .filter((v) => isValidEmail(v))
      .map(normalizeEmail),
  );
}

export function isAllowedRecipient(to: string, devMode: boolean, allowlist: ReadonlySet<string>): boolean {
  if (!devMode) return true;
  return allowlist.has(normalizeEmail(to));
}
