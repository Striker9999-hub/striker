import { beforeEach, describe, expect, it } from "vitest";
import { fakeBrowser } from "wxt/testing/fake-browser";
import { clampSendSettings } from "@/shared/limits";
import {
  deleteAllLocalData,
  geminiKeyWarning,
  loadGeminiKey,
  loadSendSettings,
  saveGeminiKey,
  saveSendSettings,
} from "@/utils/settings";

const GOOD_KEY = `AIza${"x".repeat(35)}`;

beforeEach(() => {
  fakeBrowser.reset();
});

describe("Gemini key", () => {
  it("is stored trimmed in local storage only", async () => {
    await saveGeminiKey(`  ${GOOD_KEY}\n`);
    expect(await loadGeminiKey()).toBe(GOOD_KEY);
    expect(await browser.storage.local.get("geminiApiKey")).toEqual({ geminiApiKey: GOOD_KEY });
    expect(await browser.storage.sync.get(null)).toEqual({});
  });

  it("is removed when saved empty", async () => {
    await saveGeminiKey(GOOD_KEY);
    await saveGeminiKey("   ");
    expect(await loadGeminiKey()).toBe("");
    expect(await browser.storage.local.get(null)).toEqual({});
  });

  it("soft check warns but never blocks", async () => {
    expect(geminiKeyWarning("")).toBeNull();
    expect(geminiKeyWarning(GOOD_KEY)).toBeNull();
    expect(geminiKeyWarning("sk-123")).toMatch(/AIza/);
    expect(geminiKeyWarning("AIza123")).toMatch(/39 characters/);
    expect(geminiKeyWarning(`AIza ${"x".repeat(34)}`)).toMatch(/spaces/);
    await saveGeminiKey("sk-123");
    expect(await loadGeminiKey()).toBe("sk-123");
  });
});

describe("send settings", () => {
  it("default to the fixed limits", async () => {
    expect(await loadSendSettings()).toEqual(clampSendSettings());
  });

  it("are clamped before saving", async () => {
    const saved = await saveSendSettings({
      dailySends: 500,
      gapRangeMinutes: [1, 2],
      sendWindow: { days: [0, 6, 2], start: "07:00", end: "20:00", fallbackTimeZone: "Europe/Paris" },
    });
    expect(saved).toEqual({
      dailySends: 40,
      gapRangeMinutes: [5, 5],
      sendWindow: { days: [2], start: "09:00", end: "17:00", fallbackTimeZone: "Europe/Paris" },
    });
    expect(await loadSendSettings()).toEqual(saved);
  });

  it("are clamped again on read if storage was tampered with", async () => {
    await browser.storage.local.set({ sendSettings: { dailySends: 1000, gapRangeMinutes: [0, 0] } });
    const s = await loadSendSettings();
    expect(s.dailySends).toBe(40);
    expect(s.gapRangeMinutes).toEqual([5, 5]);
  });
});

describe("deleteAllLocalData", () => {
  it("clears local, sync and session storage", async () => {
    await saveGeminiKey(GOOD_KEY);
    await saveSendSettings({ dailySends: 10 });
    await browser.storage.sync.set({ x: 1 });
    await browser.storage.session.set({ y: 2 });
    await deleteAllLocalData();
    expect(await browser.storage.local.get(null)).toEqual({});
    expect(await browser.storage.sync.get(null)).toEqual({});
    expect(await browser.storage.session.get(null)).toEqual({});
    expect(await loadGeminiKey()).toBe("");
  });
});
