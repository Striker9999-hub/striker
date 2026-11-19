import { storage } from "wxt/utils/storage";
import { type SendSettings, clampSendSettings } from "@/shared/limits";

/**
 * Extension-side settings. Everything lives in chrome.storage.local on this
 * device only (FR02, NFR12, NFR13); nothing is synced or sent to the developer.
 */

export const geminiApiKeyItem = storage.defineItem<string>("local:geminiApiKey", { fallback: "" });

export const sendSettingsItem = storage.defineItem<SendSettings>("local:sendSettings", {
  fallback: clampSendSettings(),
});

export async function loadGeminiKey(): Promise<string> {
  return geminiApiKeyItem.getValue();
}

export async function saveGeminiKey(key: string): Promise<void> {
  const trimmed = key.trim();
  if (trimmed === "") await geminiApiKeyItem.removeValue();
  else await geminiApiKeyItem.setValue(trimmed);
}

/** Stored values are clamped again on read, so a tampered store can't exceed the limits. */
export async function loadSendSettings(): Promise<SendSettings> {
  return clampSendSettings(await sendSettingsItem.getValue());
}

/** Clamps, saves and returns what was actually stored. */
export async function saveSendSettings(input: unknown): Promise<SendSettings> {
  const safe = clampSendSettings(isRecord(input) ? input : {});
  await sendSettingsItem.setValue(safe);
  return safe;
}

/** NFR14: removes everything Striker keeps in this browser. */
export async function deleteAllLocalData(): Promise<void> {
  await browser.storage.local.clear();
  await browser.storage.sync?.clear();
  await browser.storage.session?.clear();
}

/**
 * Soft format check: Gemini keys from Google AI Studio start with "AIza" and
 * are 39 characters. Returns a warning, never blocks saving.
 */
export function geminiKeyWarning(key: string): string | null {
  const k = key.trim();
  if (k === "") return null;
  if (!k.startsWith("AIza")) return "This doesn't look like a Gemini API key (they usually start with \"AIza\"). You can still save it.";
  if (/\s/.test(k)) return "The key contains spaces. Check that you copied it correctly.";
  if (k.length !== 39) return "Gemini API keys are usually 39 characters long. Check that you copied the whole key.";
  return null;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
