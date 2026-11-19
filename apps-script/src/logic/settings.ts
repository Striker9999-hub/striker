import {
  DEFAULT_DAILY_SENDS,
  DEFAULT_GAP_RANGE_MINUTES,
  DEFAULT_SEND_DAYS,
  DEFAULT_WINDOW_END,
  DEFAULT_WINDOW_START,
  MAX_DAILY_SENDS,
  MIN_GAP_MINUTES,
  type SendSettings,
  clampSendSettings,
} from "../../../shared/limits";
import { isDevModeOn, parseAllowlist } from "./allowlist";

/** Rows written to the Settings tab on setup: [key, default, note]. */
export const DEFAULT_SETTINGS_ROWS: readonly (readonly [string, string, string])[] = [
  ["DEV_MODE", "TRUE", "While TRUE, only DEV_ALLOWLIST addresses receive mail. Set to FALSE by hand to send for real."],
  ["DEV_ALLOWLIST", "", "Addresses you own, separated by commas."],
  ["DAILY_SENDS", String(DEFAULT_DAILY_SENDS), `Emails per day. Maximum ${MAX_DAILY_SENDS}.`],
  ["GAP_MIN", String(DEFAULT_GAP_RANGE_MINUTES[0]), `Minutes between sends, lower bound. Minimum ${MIN_GAP_MINUTES}.`],
  ["GAP_MAX", String(DEFAULT_GAP_RANGE_MINUTES[1]), "Minutes between sends, upper bound."],
  ["WINDOW_DAYS", DEFAULT_SEND_DAYS.join(","), "Days to send (1 = Monday ... 5 = Friday). Weekdays only."],
  ["WINDOW_START", DEFAULT_WINDOW_START, `Earliest send time, HH:MM. Not before ${DEFAULT_WINDOW_START}.`],
  ["WINDOW_END", DEFAULT_WINDOW_END, `Sending stops at this time, HH:MM. Not after ${DEFAULT_WINDOW_END}.`],
  ["FALLBACK_TZ", "", "Time zone when the recipient's is unknown, e.g. Europe/London. Blank = this Sheet's time zone."],
];

export interface Settings {
  send: SendSettings;
  devMode: boolean;
  allowlist: ReadonlySet<string>;
}

function num(value: string | undefined): number | undefined {
  if (value === undefined || value.trim() === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

/** Settings-tab values (by key) → clamped settings. Hand edits can't exceed the limits. */
export function parseSettings(values: Readonly<Record<string, string | undefined>>): Settings {
  const days = values.WINDOW_DAYS?.trim()
    ? values.WINDOW_DAYS.split(/[\s,;]+/)
        .filter(Boolean)
        .map(Number)
    : undefined;
  const gapMin = num(values.GAP_MIN);
  const gapMax = num(values.GAP_MAX);
  return {
    send: clampSendSettings({
      dailySends: num(values.DAILY_SENDS),
      gapRangeMinutes: [gapMin ?? DEFAULT_GAP_RANGE_MINUTES[0], gapMax ?? DEFAULT_GAP_RANGE_MINUTES[1]],
      sendWindow: {
        days,
        start: values.WINDOW_START?.trim(),
        end: values.WINDOW_END?.trim(),
        fallbackTimeZone: values.FALLBACK_TZ?.trim() || null,
      },
    }),
    devMode: isDevModeOn(values.DEV_MODE),
    allowlist: parseAllowlist(values.DEV_ALLOWLIST),
  };
}
