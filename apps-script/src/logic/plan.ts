import { hasOptOutLine } from "../../../shared/optout";
import { STATUS_REASONS } from "../../../shared/types";
import { isAllowedRecipient } from "./allowlist";
import { isSheetsError } from "./cells";
import { type Digest, contentMatches } from "./integrity";
import { capReached, countSendsToday } from "./cap";
import { isExcluded } from "./exclusions";
import { sendableIndices } from "./queue";
import { isInsideWindow, resolveTimeZone } from "./window";
import { gapPassed } from "./gap";
import type { LogEntry, QueueRow } from "./rows";
import type { Settings } from "./settings";

export interface PlanInput {
  now: Date;
  paused: boolean;
  settings: Settings;
  userTimeZone: string;
  nextSendAtMs: number | null;
  log: readonly LogEntry[];
  rows: readonly QueueRow[];
  exclusions: readonly string[];
  digest: Digest;
}

export type IdleReason = "paused" | "cap" | "nothing_sendable" | "gap";

export interface TickPlan {
  /** Pending rows that must be skipped, with the reason. */
  skips: { index: number; reason: string }[];
  /** Row to send now. */
  send: number | null;
  /** Row that will be sent once the gap passes. */
  scheduled: number | null;
  idle: IdleReason | null;
}

/** Why a pending row must not be sent, re-checked right before every send. */
export function skipReason(
  row: QueueRow,
  settings: Settings,
  exclusions: readonly string[],
  digest: Digest,
): string | null {
  if (isSheetsError(row.subject) || isSheetsError(row.body)) return STATUS_REASONS.sheetsError;
  if (!contentMatches(row, digest)) return STATUS_REASONS.contentChanged;
  if (isExcluded(row.to, exclusions)) return STATUS_REASONS.excluded;
  if (!isAllowedRecipient(row.to, settings.devMode, settings.allowlist)) return STATUS_REASONS.notInDevAllowlist;
  if (!hasOptOutLine(row.body)) return STATUS_REASONS.missingOptOut;
  return null;
}

/** Pure decision for one 1-minute tick. The caller applies it. */
export function planTick(input: PlanInput): TickPlan {
  const plan: TickPlan = { skips: [], send: null, scheduled: null, idle: null };
  if (input.paused) return { ...plan, idle: "paused" };

  const sendsToday = countSendsToday(input.log, input.now, input.userTimeZone);
  if (capReached(sendsToday, input.settings.send.dailySends)) return { ...plan, idle: "cap" };

  const { sendWindow } = input.settings.send;
  const inWindow = (row: QueueRow) =>
    isInsideWindow(
      input.now,
      sendWindow,
      resolveTimeZone(row.recipientTimeZone, sendWindow.fallbackTimeZone, input.userTimeZone),
    );

  let next: number | null = null;
  for (const index of sendableIndices(input.rows, inWindow)) {
    const reason = skipReason(input.rows[index]!, input.settings, input.exclusions, input.digest);
    if (reason) {
      plan.skips.push({ index, reason });
      continue;
    }
    next = index;
    break;
  }
  if (next === null) return { ...plan, idle: "nothing_sendable" };
  if (!gapPassed(input.now.getTime(), input.nextSendAtMs)) return { ...plan, scheduled: next, idle: "gap" };
  return { ...plan, send: next };
}
