import { type PauseReason, type QueueStatus, STATUS_REASONS } from "../../../shared/types";

export type ErrorClass = "quota" | "auth" | "invalid_recipient" | "temporary" | "unknown";

const PATTERNS: readonly (readonly [ErrorClass, RegExp])[] = [
  ["quota", /too many times|limit exceeded|rate limit|quota|exceeded maximum/i],
  ["auth", /authoriz|permission|access denied|access_denied|invalid_grant|not allowed to call/i],
  ["invalid_recipient", /invalid (email|argument|recipient)|no recipient|recipient.*invalid/i],
  ["temporary", /service unavailable|temporar|timed? ?out|try again|backend error|server error/i],
];

export function classifyError(error: unknown): ErrorClass {
  const message = error instanceof Error ? error.message : String(error ?? "");
  for (const [cls, re] of PATTERNS) {
    if (re.test(message)) return cls;
  }
  return "unknown";
}

export const MAX_SEND_ATTEMPTS = 3;

export interface ErrorOutcome {
  status: QueueStatus;
  reason: string;
  pause: PauseReason | null;
}

/**
 * NFR09/NFR11: quota and auth errors pause and keep the row queued; temporary
 * errors retry a bounded number of times; unknown errors are held as
 * uncertain because the email may have gone out.
 */
export function outcomeForError(cls: ErrorClass, attempts: number): ErrorOutcome {
  switch (cls) {
    case "quota":
      return { status: "queued", reason: "", pause: "quota" };
    case "auth":
      return { status: "queued", reason: "", pause: "auth" };
    case "invalid_recipient":
      return { status: "failed", reason: STATUS_REASONS.invalidRecipient, pause: null };
    case "temporary":
      return attempts >= MAX_SEND_ATTEMPTS
        ? { status: "failed", reason: STATUS_REASONS.retriesExhausted, pause: null }
        : { status: "queued", reason: "", pause: null };
    case "unknown":
      return { status: "uncertain", reason: STATUS_REASONS.unknownError, pause: null };
  }
}
