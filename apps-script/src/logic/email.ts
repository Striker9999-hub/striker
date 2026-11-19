export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

// Deliberately strict: no quoted local parts, comments or display names.
const EMAIL_RE = /^[^\s@<>(),;:"[\]\\]+@[^\s@<>(),;:"[\]\\]+\.[^\s@<>(),;:"[\]\\.]{2,}$/;

/** Format check only; it says nothing about whether the mailbox exists (FR04). */
export function isValidEmail(value: unknown): value is string {
  return typeof value === "string" && value.length <= 254 && EMAIL_RE.test(value.trim());
}
