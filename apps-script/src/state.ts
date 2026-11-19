import type { PauseReason } from "../../shared/types";
import { secretFromUuids } from "./logic/secret";

/** Script properties. Never logged (NFR12). */
const KEY = {
  secret: "SECRET",
  paused: "PAUSED",
  pauseReason: "PAUSE_REASON",
  nextSendAt: "NEXT_SEND_AT",
  bounceAckAt: "BOUNCE_ACK_AT",
} as const;

const PAUSE_REASONS: readonly string[] = ["user", "quota", "auth", "bounces"] satisfies PauseReason[];

function props(): GoogleAppsScript.Properties.Properties {
  return PropertiesService.getScriptProperties();
}

function readMs(key: string): number | null {
  const raw = props().getProperty(key);
  const n = raw === null ? Number.NaN : Number(raw);
  return Number.isFinite(n) ? n : null;
}

export function getSecret(): string | null {
  return props().getProperty(KEY.secret);
}

export function generateSecret(): string {
  const secret = secretFromUuids(Utilities.getUuid(), Utilities.getUuid());
  props().setProperty(KEY.secret, secret);
  return secret;
}

export function isPaused(): boolean {
  return props().getProperty(KEY.paused) === "true";
}

export function getPauseReason(): PauseReason | null {
  const r = props().getProperty(KEY.pauseReason);
  return r !== null && PAUSE_REASONS.includes(r) ? (r as PauseReason) : null;
}

export function pause(reason: PauseReason): void {
  props().setProperties({ [KEY.paused]: "true", [KEY.pauseReason]: reason });
}

/** FR22: the gap restarts after a resume; bounces seen so far are acknowledged. */
export function resume(nowMs: number, nextSendAtMs: number): void {
  props().setProperties({
    [KEY.paused]: "false",
    [KEY.pauseReason]: "",
    [KEY.nextSendAt]: String(nextSendAtMs),
    [KEY.bounceAckAt]: String(nowMs),
  });
}

export function getNextSendAt(): number | null {
  return readMs(KEY.nextSendAt);
}

export function setNextSendAt(ms: number): void {
  props().setProperty(KEY.nextSendAt, String(ms));
}

export function getBounceAckAt(): number {
  return readMs(KEY.bounceAckAt) ?? 0;
}
