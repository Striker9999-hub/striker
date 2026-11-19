import { MIN_GAP_MINUTES, clampSendSettings } from "../../../shared/limits";

const MINUTE_MS = 60_000;

/** FR22: random wait in the (clamped) range, never under MIN_GAP_MINUTES. */
export function computeNextSendAt(
  fromMs: number,
  gapRangeMinutes: readonly [number, number],
  random: () => number = Math.random,
): number {
  const [low, high] = clampSendSettings({ gapRangeMinutes }).gapRangeMinutes;
  const r = Math.min(Math.max(random(), 0), 1);
  const minutes = Math.max(MIN_GAP_MINUTES, low + r * (high - low));
  return fromMs + Math.ceil(minutes * MINUTE_MS);
}

export function gapPassed(nowMs: number, nextSendAtMs: number | null): boolean {
  return nextSendAtMs === null || !Number.isFinite(nextSendAtMs) || nowMs >= nextSendAtMs;
}
