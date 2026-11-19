import type { QueueStatus } from "../../../shared/types";

/** Column order of each tab. Append new columns at the end only. */
export const QUEUE_COLUMNS = [
  "id",
  "campaignId",
  "batchId",
  "approvedAt",
  "to",
  "recipientTimeZone",
  "subject",
  "body",
  "status",
  "statusReason",
  "attempts",
  "scheduledAt",
  "sentAt",
  "updatedAt",
  "contentHash", // FR19: hash of the approved subject + body
] as const;

export const LOG_COLUMNS = ["timestamp", "queueId", "to", "status", "code"] as const;
export const EXCLUSION_COLUMNS = ["value", "addedAt", "source"] as const;
export const SETTINGS_COLUMNS = ["key", "value", "note"] as const;

export type QueueColumn = (typeof QUEUE_COLUMNS)[number];
export type LogColumn = (typeof LOG_COLUMNS)[number];

/** All cells are read as display strings. */
export type QueueRow = Record<QueueColumn, string>;
export type LogEntry = Record<LogColumn, string>;

export function rowToArray<C extends string>(columns: readonly C[], row: Partial<Record<C, string>>): string[] {
  return columns.map((c) => row[c] ?? "");
}

export function arrayToRow<C extends string>(columns: readonly C[], values: readonly unknown[]): Record<C, string> {
  const row = {} as Record<C, string>;
  columns.forEach((c, i) => {
    row[c] = values[i] == null ? "" : String(values[i]);
  });
  return row;
}

export function isPending(status: string): status is Extract<QueueStatus, "queued" | "scheduled"> {
  return status === "queued" || status === "scheduled";
}
