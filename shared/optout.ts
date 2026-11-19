/**
 * The opt-out line every email must carry (FR18, NFR16, NFR17).
 *
 * The sender refuses to queue or send a body without it, and the extension
 * offers no setting to remove it.
 */

export const OPT_OUT_LINE =
  "If you'd prefer not to hear from me again, just reply 'no thanks' and I won't contact you further.";

function normalize(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** True when some line of `body` is the opt-out line (whitespace-insensitive). */
export function hasOptOutLine(body: unknown): boolean {
  if (typeof body !== "string") return false;
  const wanted = normalize(OPT_OUT_LINE);
  return body.split(/\r?\n/).some((line) => normalize(line) === wanted);
}

/** Returns `body` with the opt-out line appended on its own paragraph if missing. */
export function withOptOutLine(body: string): string {
  if (hasOptOutLine(body)) return body;
  const trimmed = body.replace(/\s+$/, "");
  return trimmed === "" ? OPT_OUT_LINE : `${trimmed}\n\n${OPT_OUT_LINE}`;
}
