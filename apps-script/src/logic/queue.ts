import { isValidTimeZone } from "../../../shared/limits";
import { hasOptOutLine } from "../../../shared/optout";
import { bodyProblem, subjectProblem } from "../../../shared/textSafety";
import { type AddToQueueResult, QUEUE_STATUSES, type QueueStatus, STATUS_REASONS } from "../../../shared/types";
import { isSheetsError } from "./cells";
import { isValidEmail, normalizeEmail } from "./email";
import { isExcluded } from "./exclusions";
import { type Digest, contentHash } from "./integrity";
import { type QueueRow, isPending } from "./rows";

export const MAX_ITEMS_PER_REQUEST = 200;
export const MAX_SUBJECT_LENGTH = 200;
export const MAX_BODY_LENGTH = 20_000;
export const MAX_ID_LENGTH = 100;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isId(v: unknown): v is string {
  return typeof v === "string" && v.trim() !== "" && v.length <= MAX_ID_LENGTH && !/[\r\n]/.test(v);
}

export type BuildResult = { error: string } | { rows: QueueRow[]; result: AddToQueueResult };

/**
 * Validates an approved batch from the extension and turns it into queue rows.
 * Whole-request problems return an error; per-item problems reject that item
 * only (NFR22). Ids already queued are reported as duplicates, never re-added.
 */
export function buildQueueRows(
  payload: unknown,
  existingIds: Iterable<string>,
  exclusions: readonly string[],
  now: Date,
  digest: Digest,
): BuildResult {
  if (!isRecord(payload)) return { error: "invalid_payload" };
  const { batchId, approvedAt, items } = payload;
  if (!isId(batchId)) return { error: "invalid_batch_id" };
  if (typeof approvedAt !== "string" || Number.isNaN(Date.parse(approvedAt))) return { error: "not_approved" };
  if (!Array.isArray(items) || items.length === 0) return { error: "no_items" };
  if (items.length > MAX_ITEMS_PER_REQUEST) return { error: "too_many_items" };

  const nowIso = now.toISOString();
  const seen = new Set(existingIds);
  const rows: QueueRow[] = [];
  const result: AddToQueueResult = { added: 0, duplicates: [], rejected: [] };

  for (const item of items as unknown[]) {
    const id = isRecord(item) && isId(item.id) ? item.id.trim() : null;
    if (!isRecord(item) || id === null) {
      result.rejected.push({ id: "", reason: "invalid_id" });
      continue;
    }
    if (seen.has(id)) {
      result.duplicates.push(id);
      continue;
    }
    const reason = itemProblem(item);
    if (reason) {
      result.rejected.push(reason.message ? { id, reason: reason.code, message: reason.message } : { id, reason: reason.code });
      continue;
    }
    seen.add(id);
    const to = normalizeEmail((item as Validated).to);
    const subject = (item as Validated).subject.trim();
    const body = (item as Validated).body;
    const excluded = isExcluded(to, exclusions);
    rows.push({
      id,
      campaignId: (item as Validated).campaignId,
      batchId: batchId.trim(),
      approvedAt: new Date(approvedAt).toISOString(),
      to,
      recipientTimeZone: isValidTimeZone((item as Validated).recipientTimeZone) ? (item as Validated).recipientTimeZone : "",
      subject,
      body,
      status: excluded ? "skipped" : "queued",
      statusReason: excluded ? STATUS_REASONS.excluded : "",
      attempts: "0",
      scheduledAt: "",
      sentAt: "",
      updatedAt: nowIso,
      contentHash: contentHash(subject, body, digest),
    });
    result.added++;
  }
  return { rows, result };
}

/** An item after itemProblem() returned null (type-level only; emits nothing). */
type Validated = Record<string, unknown> & {
  campaignId: string;
  to: string;
  subject: string;
  body: string;
  recipientTimeZone: string;
};

interface ItemProblem {
  code: string;
  message?: string;
}

function itemProblem(item: Record<string, unknown>): ItemProblem | null {
  const code = (c: string): ItemProblem => ({ code: c });
  if (!isId(item.campaignId)) return code("invalid_campaign_id");
  if (!isValidEmail(item.to)) return code("invalid_recipient");
  if (typeof item.subject !== "string" || item.subject.trim() === "" || /[\r\n]/.test(item.subject)) {
    return code("invalid_subject");
  }
  if (item.subject.length > MAX_SUBJECT_LENGTH) return code("subject_too_long");
  if (typeof item.body !== "string" || item.body.trim() === "") return code("invalid_body");
  if (item.body.length > MAX_BODY_LENGTH) return code("body_too_long");
  if (isSheetsError(item.subject) || isSheetsError(item.body)) return code("sheets_error_value");
  const subjectMsg = subjectProblem(item.subject);
  if (subjectMsg) return { code: "unsafe_subject_start", message: subjectMsg };
  const bodyMsg = bodyProblem(item.body);
  if (bodyMsg) return { code: "unsafe_body_line_start", message: bodyMsg };
  if (!hasOptOutLine(item.body)) return code("missing_opt_out");
  return null;
}

/** Pending rows inside their sending window, in sheet order. */
export function sendableIndices(rows: readonly QueueRow[], insideWindow: (row: QueueRow) => boolean): number[] {
  const out: number[] = [];
  rows.forEach((row, i) => {
    if (isPending(row.status) && insideWindow(row)) out.push(i);
  });
  return out;
}

/** Rows left in "sending" for at least `afterMs` (the execution died mid-send). */
export function stuckSendingIndices(rows: readonly QueueRow[], nowMs: number, afterMs: number): number[] {
  const out: number[] = [];
  rows.forEach((row, i) => {
    if (row.status !== "sending") return;
    const at = Date.parse(row.updatedAt);
    if (Number.isNaN(at) || nowMs - at >= afterMs) out.push(i);
  });
  return out;
}

export function countByStatus(rows: readonly QueueRow[]): Record<QueueStatus, number> {
  const counts = Object.fromEntries(QUEUE_STATUSES.map((s) => [s, 0])) as Record<QueueStatus, number>;
  for (const row of rows) {
    if (row.status in counts) counts[row.status as QueueStatus]++;
  }
  return counts;
}
