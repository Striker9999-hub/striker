import { STATUS_REASONS } from "../../shared/types";
import { bounceThresholdReached, countBouncedRecipients, recentSentRecipients } from "./logic/bounces";
import { classifyError, outcomeForError } from "./logic/errors";
import { computeNextSendAt } from "./logic/gap";
import { planTick } from "./logic/plan";
import { stuckSendingIndices } from "./logic/queue";
import type { QueueRow } from "./logic/rows";
import { parseSettings } from "./logic/settings";
import { sha256Hex } from "./digest";
import { foundInSent, recentBounces, sendPlainText } from "./sender";
import { appendLog, readExclusions, readLog, readQueue, readSettings, userTimeZone, writeQueueRow } from "./sheet";
import { getBounceAckAt, getNextSendAt, isPaused, pause, setNextSendAt } from "./state";

/** A row still "sending" after this long was interrupted (executions cap at 6 min). */
const STUCK_AFTER_MS = 10 * 60_000;

/** Time-driven trigger, every minute. At most one email per tick. */
export function tick(): void {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return;
  try {
    runTick(new Date());
  } finally {
    lock.releaseLock();
  }
}

function update(rows: QueueRow[], index: number, changes: Partial<QueueRow>, now: Date): QueueRow {
  const row = { ...rows[index], ...changes, updatedAt: now.toISOString() };
  rows[index] = row;
  writeQueueRow(index, row);
  return row;
}

function log(row: QueueRow, status: string, code: string, now: Date): void {
  appendLog({ timestamp: now.toISOString(), queueId: row.id, to: row.to, status, code });
}

function runTick(now: Date): void {
  const rows = readQueue();
  recoverStuckRows(rows, now);

  const settings = parseSettings(readSettings());
  const sendLog = readLog();
  const plan = planTick({
    now,
    paused: isPaused(),
    settings,
    userTimeZone: userTimeZone(),
    nextSendAtMs: getNextSendAt(),
    log: sendLog,
    rows,
    exclusions: readExclusions(),
    digest: sha256Hex,
  });

  for (const { index, reason } of plan.skips) {
    const row = update(rows, index, { status: "skipped", statusReason: reason }, now);
    log(row, "skipped", reason, now);
    console.log(`skipped ${row.id}: ${reason}`);
  }

  // Only one row is ever "scheduled": the one that goes next.
  rows.forEach((row, i) => {
    if (row.status === "scheduled" && i !== plan.scheduled) update(rows, i, { status: "queued", scheduledAt: "" }, now);
  });
  if (plan.scheduled !== null) {
    const at = new Date(getNextSendAt() ?? now.getTime()).toISOString();
    if (rows[plan.scheduled].status !== "scheduled" || rows[plan.scheduled].scheduledAt !== at) {
      update(rows, plan.scheduled, { status: "scheduled", scheduledAt: at }, now);
    }
  }

  if (plan.send === null) return;

  // FR24: check bounces only when about to send.
  const bounced = countBouncedRecipients(recentSentRecipients(sendLog), recentBounces(), getBounceAckAt());
  if (bounceThresholdReached(bounced)) {
    pause("bounces");
    console.log(`auto-paused: bounces=${bounced}`);
    return;
  }

  sendOne(rows, plan.send, settings.send.gapRangeMinutes, now);
}

function sendOne(rows: QueueRow[], index: number, gapRange: readonly [number, number], now: Date): void {
  let row = rows[index];
  const attempts = Number(row.attempts) + 1 || 1;

  // NFR09: a retry first checks whether an earlier attempt actually went out.
  if (attempts > 1 && foundInSent(row.to, row.subject, Date.parse(row.approvedAt))) {
    row = update(rows, index, { status: "sent", statusReason: "", sentAt: now.toISOString() }, now);
    log(row, "sent", "found_in_sent", now);
    return;
  }

  row = update(rows, index, { status: "sending", attempts: String(attempts), scheduledAt: "" }, now);
  log(row, "sending", "", now);
  SpreadsheetApp.flush(); // persist "sending" before handing to Gmail

  try {
    sendPlainText(row.to, row.subject, row.body);
    row = update(rows, index, { status: "sent", statusReason: "", sentAt: now.toISOString() }, now);
    log(row, "sent", "", now);
    console.log(`sent ${row.id}`);
  } catch (error) {
    const cls = classifyError(error);
    const outcome = outcomeForError(cls, attempts);
    row = update(rows, index, { status: outcome.status, statusReason: outcome.reason }, now);
    log(row, outcome.status, cls, now);
    console.log(`send error ${row.id}: ${cls}`);
    if (outcome.pause) pause(outcome.pause);
  } finally {
    setNextSendAt(computeNextSendAt(now.getTime(), gapRange));
    SpreadsheetApp.flush();
  }
}

/** NFR09: interrupted sends become "sent" if found in Gmail Sent, else "uncertain". */
function recoverStuckRows(rows: QueueRow[], now: Date): void {
  for (const index of stuckSendingIndices(rows, now.getTime(), STUCK_AFTER_MS)) {
    const row = rows[index];
    const since = Date.parse(row.updatedAt) || Date.parse(row.approvedAt) || 0;
    if (foundInSent(row.to, row.subject, since - 60_000)) {
      log(update(rows, index, { status: "sent", statusReason: "", sentAt: row.updatedAt }, now), "sent", "found_in_sent", now);
    } else {
      const reason = STATUS_REASONS.stuckSending;
      log(update(rows, index, { status: "uncertain", statusReason: reason }, now), "uncertain", "stuck_sending", now);
    }
  }
}
