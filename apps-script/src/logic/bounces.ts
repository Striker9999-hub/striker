import { normalizeEmail } from "./email";
import type { LogEntry } from "./rows";

/** FR24: pause when 3+ of the last 20 sent recipients bounced. */
export const BOUNCE_LOOKBACK_SENDS = 20;
export const BOUNCE_PAUSE_THRESHOLD = 3;

export interface BounceMessage {
  date: number;
  text: string;
}

export function recentSentRecipients(log: readonly LogEntry[], n = BOUNCE_LOOKBACK_SENDS): string[] {
  return log
    .filter((e) => e.status === "sent")
    .slice(-n)
    .map((e) => normalizeEmail(e.to));
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Counts distinct recipients that appear in a bounce newer than the last
 * acknowledgement (resume). The address must not be preceded by an address
 * character, so "bob@x.com" doesn't match "jimbob@x.com".
 *
 * Known quirk (deployed behaviour, kept as is): the trailing class
 * `[^a-z0-9-]` also accepts ".", so "bob@x.com" DOES match "bob@x.com.au"
 * and the `\.(?!…)` alternative never decides anything. This can only
 * over-count, i.e. pause early.
 */
export function countBouncedRecipients(
  recipients: readonly string[],
  bounces: readonly BounceMessage[],
  ackAtMs: number,
): number {
  const fresh = bounces.filter((b) => b.date > ackAtMs).map((b) => b.text.toLowerCase());
  let count = 0;
  for (const r of new Set(recipients)) {
    const re = new RegExp(`(^|[^a-z0-9._%+-])${escapeRegExp(r)}($|[^a-z0-9-]|\\.(?![a-z0-9]))`);
    if (fresh.some((t) => re.test(t))) count++;
  }
  return count;
}

export function bounceThresholdReached(count: number): boolean {
  return count >= BOUNCE_PAUSE_THRESHOLD;
}
