import { type SendWindow, clampSendWindow, isValidTimeZone, parseTime } from "../../../shared/limits";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function localDayAndMinutes(now: Date, timeZone: string): { day: number; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    day: WEEKDAYS.indexOf(get("weekday")),
    minutes: (Number(get("hour")) % 24) * 60 + Number(get("minute")),
  };
}

/** FR23: recipient's zone when known, else the fallback, else the Sheet's. */
export function resolveTimeZone(recipientTimeZone: unknown, fallbackTimeZone: unknown, userTimeZone: string): string {
  if (isValidTimeZone(recipientTimeZone)) return recipientTimeZone;
  if (isValidTimeZone(fallbackTimeZone)) return fallbackTimeZone;
  return userTimeZone;
}

export function isInsideWindow(now: Date, window: SendWindow, timeZone: string): boolean {
  const safe = clampSendWindow(window);
  const { day, minutes } = localDayAndMinutes(now, timeZone);
  const start = parseTime(safe.start) as number;
  const end = parseTime(safe.end) as number;
  return safe.days.includes(day) && minutes >= start && minutes < end;
}
