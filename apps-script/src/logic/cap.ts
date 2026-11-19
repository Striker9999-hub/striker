import { MAX_DAILY_SENDS, clampSendSettings } from "../../../shared/limits";
import type { QueueStatus } from "../../../shared/types";
import type { LogEntry } from "./rows";

export function dayKey(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** Anything that may have reached Gmail counts toward the cap. */
const COUNTED: ReadonlySet<string> = new Set<QueueStatus>(["sending", "sent", "uncertain"]);

export function countSendsToday(log: readonly LogEntry[], now: Date, timeZone: string): number {
  const today = dayKey(now, timeZone);
  const ids = new Set<string>();
  for (const entry of log) {
    if (!COUNTED.has(entry.status)) continue;
    const at = new Date(entry.timestamp);
    if (Number.isNaN(at.getTime())) continue;
    if (dayKey(at, timeZone) === today) ids.add(entry.queueId);
  }
  return ids.size;
}

export function capReached(sendsToday: number, dailyCap: number): boolean {
  const cap = Math.min(clampSendSettings({ dailySends: dailyCap }).dailySends, MAX_DAILY_SENDS);
  return sendsToday >= cap;
}
