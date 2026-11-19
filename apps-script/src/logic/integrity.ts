import type { QueueRow } from "./rows";

export type Digest = (text: string) => string;

export function contentHash(subject: string, body: string, digest: Digest): string {
  return digest(JSON.stringify([subject, body]));
}

/** FR19: the row may only be sent if subject + body still match what was approved. */
export function contentMatches(row: Pick<QueueRow, "subject" | "body" | "contentHash">, digest: Digest): boolean {
  return row.contentHash !== "" && contentHash(row.subject, row.body, digest) === row.contentHash;
}
