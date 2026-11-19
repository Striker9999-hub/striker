/** Types and constants shared by the extension and the Apps Script sender. */

export const QUEUE_STATUSES = [
  "queued", // approved and waiting (FR19)
  "scheduled", // the row the sender will send next
  "sending", // handed to Gmail; outcome not yet recorded
  "sent", // accepted by Google (not proof of inbox delivery)
  "failed", // permanent error, or temporary errors exhausted retries
  "skipped", // not sent on purpose; see statusReason
  "uncertain", // may or may not have gone out; held, never retried blindly (NFR09)
] as const;

export type QueueStatus = (typeof QUEUE_STATUSES)[number];

export const STATUS_REASONS = {
  notInDevAllowlist: "skipped: not in dev allowlist",
  excluded: "excluded",
  missingOptOut: "missing opt-out line",
  cancelled: "cancelled",
  invalidRecipient: "invalid recipient",
  retriesExhausted: "temporary errors: retries exhausted",
  unknownError: "unknown send error",
  stuckSending: "interrupted while sending; not found in Sent",
  contentChanged: "content_changed", // subject/body no longer match what was approved
  sheetsError: "sheets_error_value", // subject/body is a Sheets error such as #ERROR!
} as const;

export type StatusReason = (typeof STATUS_REASONS)[keyof typeof STATUS_REASONS];

export type PauseReason = "user" | "quota" | "auth" | "bounces";

/** One approved email as sent by the extension in `addToQueue`. */
export interface QueueItemInput {
  id: string;
  campaignId: string;
  to: string;
  subject: string;
  body: string;
  recipientTimeZone?: string;
}

export interface AddToQueuePayload {
  batchId: string;
  /** ISO time the user approved the batch (FR19). */
  approvedAt: string;
  items: QueueItemInput[];
}

export type ApiAction = "addToQueue" | "pause" | "resume" | "cancel" | "getStatus" | "addExclusion";

export interface ApiRequest {
  secret: string;
  action: ApiAction;
  payload?: unknown;
}

export type ApiResponse<T = unknown> = { ok: true; data: T } | { ok: false; error: string };

export interface AddToQueueResult {
  added: number;
  duplicates: string[];
  rejected: { id: string; reason: string; message?: string }[];
}

export interface SenderStatus {
  counts: Record<QueueStatus, number>;
  sentToday: number;
  dailyCap: number;
  paused: boolean;
  pauseReason: PauseReason | null;
  nextSendAt: string | null;
  devMode: boolean;
}
