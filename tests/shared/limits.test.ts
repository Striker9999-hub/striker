import { describe, expect, it } from "vitest";
import {
  DEFAULT_GAP_RANGE_MINUTES,
  DEFAULT_SEND_WINDOW,
  MAX_DAILY_SENDS,
  MIN_GAP_MINUTES,
  clampSendSettings,
  clampSendWindow,
  isValidTimeZone,
  parseTime,
} from "@/shared/limits";

describe("fixed limits", () => {
  it("match the 17 Nov 2026 decisions", () => {
    expect(MAX_DAILY_SENDS).toBe(40);
    expect(clampSendSettings().dailySends).toBe(40);
    expect(MIN_GAP_MINUTES).toBe(5);
    expect(DEFAULT_GAP_RANGE_MINUTES).toEqual([5, 6]);
    expect(DEFAULT_SEND_WINDOW).toEqual({ days: [1, 2, 3, 4, 5], start: "09:00", end: "17:00", fallbackTimeZone: null });
  });
});

describe("clampSendSettings", () => {
  it.each([
    [undefined, 40],
    [0, 1],
    [-5, 1],
    [12.9, 12],
    [41, 40],
    [1e9, 40],
    [Number.NaN, 40],
    [Number.POSITIVE_INFINITY, 40],
    ["30", 40],
  ])("dailySends %s → %s", (input, expected) => {
    expect(clampSendSettings({ dailySends: input }).dailySends).toBe(expected);
  });

  it.each([
    [[5, 6], [5, 6]],
    [[1, 2], [5, 5]],
    [[4, 7], [5, 7]],
    [[8, 6], [6, 8]],
    [[10, 10], [10, 10]],
    [[5], [5, 6]],
    [[5, "6"], [5, 6]],
    ["5-6", [5, 6]],
    [[Number.NaN, 6], [5, 6]],
  ])("gapRangeMinutes %j → %j", (input, expected) => {
    expect(clampSendSettings({ gapRangeMinutes: input }).gapRangeMinutes).toEqual(expected);
  });

  it("never yields a gap under the minimum", () => {
    for (const a of [-10, 0, 1, 4.99, 5, 6, 30]) {
      for (const b of [-10, 0, 1, 4.99, 5, 6, 30]) {
        const [low, high] = clampSendSettings({ gapRangeMinutes: [a, b] }).gapRangeMinutes;
        expect(low).toBeGreaterThanOrEqual(MIN_GAP_MINUTES);
        expect(high).toBeGreaterThanOrEqual(low);
      }
    }
  });
});

describe("clampSendWindow", () => {
  it("keeps weekdays only, sorted and unique", () => {
    expect(clampSendWindow({ days: [5, 0, 6, 3, 3, 1] }).days).toEqual([1, 3, 5]);
    expect(clampSendWindow({ days: [0, 6] }).days).toEqual([1, 2, 3, 4, 5]);
    expect(clampSendWindow({ days: [] }).days).toEqual([1, 2, 3, 4, 5]);
    expect(clampSendWindow({ days: "1,2" }).days).toEqual([1, 2, 3, 4, 5]);
  });

  it("narrows hours but never widens them past 09:00–17:00", () => {
    expect(clampSendWindow({ start: "10:30", end: "15:00" })).toMatchObject({ start: "10:30", end: "15:00" });
    expect(clampSendWindow({ start: "06:00", end: "22:00" })).toMatchObject({ start: "09:00", end: "17:00" });
    expect(clampSendWindow({ start: "16:00", end: "10:00" })).toMatchObject({ start: "09:00", end: "17:00" });
    expect(clampSendWindow({ start: "9:00", end: "bad" })).toMatchObject({ start: "09:00", end: "17:00" });
  });

  it("accepts only valid IANA fallback time zones", () => {
    expect(clampSendWindow({ fallbackTimeZone: "Europe/London" }).fallbackTimeZone).toBe("Europe/London");
    expect(clampSendWindow({ fallbackTimeZone: "Mars/Olympus" }).fallbackTimeZone).toBeNull();
    expect(clampSendWindow({ fallbackTimeZone: " " }).fallbackTimeZone).toBeNull();
    expect(clampSendWindow(null)).toEqual(DEFAULT_SEND_WINDOW);
  });
});

describe("helpers", () => {
  it("parseTime", () => {
    expect(parseTime("00:00")).toBe(0);
    expect(parseTime("23:59")).toBe(1439);
    expect(parseTime("24:00")).toBeNull();
    expect(parseTime(900)).toBeNull();
  });
  it("isValidTimeZone", () => {
    expect(isValidTimeZone("America/New_York")).toBe(true);
    expect(isValidTimeZone("nope")).toBe(false);
    expect(isValidTimeZone(undefined)).toBe(false);
  });
});
