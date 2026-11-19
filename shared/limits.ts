/**
 * Fixed safety limits (NFR05, NFR17; decisions of 17 Nov 2026).
 *
 * Shared by the extension and the Apps Script sender. Every user-supplied
 * value goes through `clampSendSettings`, so no setting can exceed the cap,
 * shorten the gap, or widen the sending window.
 */

export const MAX_DAILY_SENDS = 40;
export const DEFAULT_DAILY_SENDS = 40;
export const MIN_GAP_MINUTES = 5;
export const DEFAULT_GAP_RANGE_MINUTES: readonly [number, number] = [5, 6];
/** ISO-style weekdays as returned by Date#getDay: 1 = Monday ... 5 = Friday. */
export const DEFAULT_SEND_DAYS: readonly number[] = [1, 2, 3, 4, 5];
export const DEFAULT_WINDOW_START = "09:00";
export const DEFAULT_WINDOW_END = "17:00";

export interface SendWindow {
  /** Days of week (0 = Sunday). Only Monday–Friday are allowed. */
  days: readonly number[];
  /** "HH:MM", not before 09:00. */
  start: string;
  /** "HH:MM", not after 17:00. Sending stops at this time. */
  end: string;
  /** IANA time zone used when the recipient's is unknown; null = the Sheet's. */
  fallbackTimeZone: string | null;
}

export interface SendSettings {
  dailySends: number;
  gapRangeMinutes: readonly [number, number];
  sendWindow: SendWindow;
}

export interface SendSettingsInput {
  dailySends?: unknown;
  gapRangeMinutes?: unknown;
  sendWindow?: unknown;
}

export const DEFAULT_SEND_WINDOW: SendWindow = {
  days: DEFAULT_SEND_DAYS,
  start: DEFAULT_WINDOW_START,
  end: DEFAULT_WINDOW_END,
  fallbackTimeZone: null,
};

export function clampSendSettings(input: SendSettingsInput = {}): SendSettings {
  return {
    dailySends: clampDailySends(input.dailySends),
    gapRangeMinutes: clampGapRange(input.gapRangeMinutes),
    sendWindow: clampSendWindow(input.sendWindow),
  };
}

export function clampSendWindow(value: unknown): SendWindow {
  const input = isRecord(value) ? value : {};
  const [start, end] = clampWindowHours(input.start, input.end);
  return {
    days: clampDays(input.days),
    start,
    end,
    fallbackTimeZone: isValidTimeZone(input.fallbackTimeZone) ? input.fallbackTimeZone : null,
  };
}

function clampDays(value: unknown): readonly number[] {
  if (!Array.isArray(value)) return DEFAULT_SEND_DAYS;
  const days = [...new Set(value)].filter((d) => DEFAULT_SEND_DAYS.includes(d)).sort((a, b) => a - b);
  return days.length > 0 ? days : DEFAULT_SEND_DAYS;
}

function clampWindowHours(start: unknown, end: unknown): [string, string] {
  const earliest = parseTime(DEFAULT_WINDOW_START) as number;
  const latest = parseTime(DEFAULT_WINDOW_END) as number;
  const s = Math.max(earliest, parseTime(start) ?? earliest);
  const e = Math.min(latest, parseTime(end) ?? latest);
  if (s >= e) return [DEFAULT_WINDOW_START, DEFAULT_WINDOW_END];
  return [formatTime(s), formatTime(e)];
}

/** "HH:MM" (24h) → minutes after midnight, or null if malformed. */
export function parseTime(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

function formatTime(minutes: number): string {
  const hh = String(Math.floor(minutes / 60)).padStart(2, "0");
  const mm = String(minutes % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

export function isValidTimeZone(value: unknown): value is string {
  if (typeof value !== "string" || value.trim() === "") return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function clampDailySends(value: unknown): number {
  if (!isFiniteNumber(value)) return DEFAULT_DAILY_SENDS;
  return Math.min(MAX_DAILY_SENDS, Math.max(1, Math.floor(value)));
}

function clampGapRange(value: unknown): readonly [number, number] {
  if (!Array.isArray(value) || value.length !== 2 || !isFiniteNumber(value[0]) || !isFiniteNumber(value[1])) {
    return DEFAULT_GAP_RANGE_MINUTES;
  }
  const low = Math.max(MIN_GAP_MINUTES, Math.min(value[0], value[1]));
  const high = Math.max(low, value[0], value[1]);
  return [low, high];
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
