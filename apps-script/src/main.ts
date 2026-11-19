/**
 * Apps Script entry points. build:gas exposes these as top-level functions
 * (Apps Script only sees globals) that delegate to the bundled `Striker`.
 */
import {
  DEFAULT_DAILY_SENDS,
  DEFAULT_GAP_RANGE_MINUTES,
  DEFAULT_SEND_WINDOW,
  MAX_DAILY_SENDS,
  MIN_GAP_MINUTES,
} from "../../shared/limits";
import type { PauseReason } from "../../shared/types";
import { tick } from "./scheduler";
import { getStatus, handleRequest } from "./webapp";
import { ensureSheets } from "./sheet";
import { generateSecret, getSecret } from "./state";

export const limits = {
  MAX_DAILY_SENDS,
  DEFAULT_DAILY_SENDS,
  MIN_GAP_MINUTES,
  DEFAULT_GAP_RANGE_MINUTES,
  DEFAULT_SEND_WINDOW,
};

const TICK_HANDLER = "strikerTick";

export function doPost(e?: GoogleAppsScript.Events.DoPost): GoogleAppsScript.Content.TextOutput {
  const response = handleRequest(e?.postData?.contents ?? "");
  return ContentService.createTextOutput(JSON.stringify(response)).setMimeType(ContentService.MimeType.JSON);
}

export function strikerTick(): void {
  tick();
}

export function onOpen(): void {
  SpreadsheetApp.getUi()
    .createMenu("Striker")
    .addItem("Set up / repair", "strikerSetup")
    .addItem("Show status", "strikerShowStatus")
    .addSeparator()
    .addItem("Generate new secret", "strikerNewSecret")
    .addToUi();
}

/** Menu: creates tabs, (re)installs the 1-minute trigger, shows a secret once. */
export function strikerSetup(): void {
  ensureSheets();
  for (const trigger of ScriptApp.getProjectTriggers()) {
    if (trigger.getHandlerFunction() === TICK_HANDLER) ScriptApp.deleteTrigger(trigger);
  }
  ScriptApp.newTrigger(TICK_HANDLER).timeBased().everyMinutes(1).create();
  if (getSecret()) {
    SpreadsheetApp.getUi().alert(
      "Striker is set up. A secret already exists. If you lost it, use Striker → Generate new secret.",
    );
  } else {
    showSecret(generateSecret());
  }
}

export function strikerNewSecret(): void {
  const ui = SpreadsheetApp.getUi();
  const answer = ui.alert(
    "Generate a new secret?",
    "The extension stops working until you paste the new secret into it.",
    ui.ButtonSet.OK_CANCEL,
  );
  if (answer === ui.Button.OK) showSecret(generateSecret());
}

function showSecret(secret: string): void {
  SpreadsheetApp.getUi().alert(
    "Striker setup secret",
    `${secret}\n\nCopy this into the Striker extension. It will not be shown again.`,
    SpreadsheetApp.getUi().ButtonSet.OK,
  );
}

const PAUSE_HELP: Record<PauseReason, string> = {
  user: "Paused by you.",
  quota: "Paused: Google reported a sending limit. Resume tomorrow.",
  auth: "Paused: authorization was revoked. Run Striker → Set up / repair to re-authorize, then resume.",
  bounces: "Paused: 3 or more of the last 20 emails bounced. Check your contact list before resuming.",
};

export function strikerShowStatus(): void {
  const s = getStatus(new Date());
  const lines = [
    s.paused ? PAUSE_HELP[s.pauseReason ?? "user"] : "Running.",
    `DEV_MODE: ${s.devMode ? "ON (allowlist only)" : "OFF"}`,
    `Sent today: ${s.sentToday} of ${s.dailyCap}`,
    `Next send no earlier than: ${s.nextSendAt ?? "now"}`,
    "",
    ...Object.entries(s.counts).map(([status, n]) => `${status}: ${n}`),
  ];
  SpreadsheetApp.getUi().alert("Striker status", lines.join("\n"), SpreadsheetApp.getUi().ButtonSet.OK);
}
