import type { BounceMessage } from "./logic/bounces";

/** NFR06: plain text only, no attachments, no tracking. */
export function sendPlainText(to: string, subject: string, body: string): void {
  GmailApp.sendEmail(to, subject, body);
}

/** Gmail's after: is day-granular, so search from the day before. */
function gmailDate(ms: number): string {
  const d = new Date(ms - 24 * 60 * 60 * 1000);
  return `${d.getUTCFullYear()}/${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
}

/** NFR09: did an email with this subject to this address leave since `sinceMs`? */
export function foundInSent(to: string, subject: string, sinceMs: number): boolean {
  const addr = to.toLowerCase();
  const threads = GmailApp.search(`in:sent to:${addr} after:${gmailDate(sinceMs)}`, 0, 20);
  return threads.some((thread) =>
    thread
      .getMessages()
      .some(
        (m) =>
          m.getDate().getTime() >= sinceMs - 60_000 &&
          m.getSubject() === subject &&
          m.getTo().toLowerCase().includes(addr),
      ),
  );
}

/** Delivery-failure notices from the last 7 days (first 20k chars of each). */
export function recentBounces(): BounceMessage[] {
  const threads = GmailApp.search("from:(mailer-daemon OR postmaster) newer_than:7d", 0, 30);
  const out: BounceMessage[] = [];
  for (const thread of threads) {
    for (const m of thread.getMessages()) {
      if (!/mailer-daemon|postmaster/i.test(m.getFrom())) continue;
      out.push({ date: m.getDate().getTime(), text: m.getPlainBody().slice(0, 20_000) });
    }
  }
  return out;
}
