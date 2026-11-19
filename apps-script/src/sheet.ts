import { escapeCell, unescapeCell } from "./logic/cells";
import {
  EXCLUSION_COLUMNS,
  LOG_COLUMNS,
  type LogEntry,
  QUEUE_COLUMNS,
  type QueueRow,
  SETTINGS_COLUMNS,
  arrayToRow,
  rowToArray,
} from "./logic/rows";
import { DEFAULT_SETTINGS_ROWS } from "./logic/settings";

type Sheet = GoogleAppsScript.Spreadsheet.Sheet;

export const TABS = {
  queue: "Queue",
  log: "SendLog",
  exclusions: "Exclusions",
  settings: "Settings",
} as const;

const HEADERS: Record<string, readonly string[]> = {
  [TABS.queue]: QUEUE_COLUMNS,
  [TABS.log]: LOG_COLUMNS,
  [TABS.exclusions]: EXCLUSION_COLUMNS,
  [TABS.settings]: SETTINGS_COLUMNS,
};

/** Only the newest log rows are read (enough for the cap and bounce checks). */
const LOG_TAIL_ROWS = 2000;
/** Plain-text number format, so Sheets never reinterprets values. */
const PLAIN_TEXT = "@";

function spreadsheet(): GoogleAppsScript.Spreadsheet.Spreadsheet {
  return SpreadsheetApp.getActiveSpreadsheet();
}

export function userTimeZone(): string {
  return spreadsheet().getSpreadsheetTimeZone();
}

/** Creates missing tabs and headers and appends missing Settings keys. Idempotent. */
export function ensureSheets(): void {
  for (const [name, header] of Object.entries(HEADERS)) {
    let sheet = spreadsheet().getSheetByName(name);
    if (!sheet) sheet = spreadsheet().insertSheet(name);
    if (sheet.getLastRow() === 0) {
      writeRows(sheet, 1, [header]);
      sheet.setFrozenRows(1);
    } else if (sheet.getLastColumn() < header.length) {
      writeRows(sheet, 1, [header]);
    }
  }
  const settings = tab(TABS.settings);
  const present = new Set(Object.keys(readSettings()));
  const missing = DEFAULT_SETTINGS_ROWS.filter(([key]) => !present.has(key));
  if (missing.length > 0) {
    writeRows(settings, settings.getLastRow() + 1, missing.map((r) => [...r]));
  }
}

function tab(name: string): Sheet {
  const sheet = spreadsheet().getSheetByName(name);
  if (sheet) return sheet;
  ensureSheets();
  return spreadsheet().getSheetByName(name) as Sheet;
}

function writeRows(sheet: Sheet, startRow: number, rows: readonly (readonly string[])[]): void {
  if (rows.length === 0) return;
  const range = sheet.getRange(startRow, 1, rows.length, rows[0].length);
  range.setNumberFormat(PLAIN_TEXT);
  range.setValues(rows.map((r) => r.map(escapeCell)));
}

function readBody(sheet: Sheet, columns: number, fromRow = 2): string[][] {
  const last = sheet.getLastRow();
  if (last < fromRow) return [];
  return sheet
    .getRange(fromRow, 1, last - fromRow + 1, columns)
    .getDisplayValues()
    .map((r) => r.map(unescapeCell));
}

export function readQueue(): QueueRow[] {
  return readBody(tab(TABS.queue), QUEUE_COLUMNS.length).map((v) => arrayToRow(QUEUE_COLUMNS, v));
}

/** `index` is the 0-based position in readQueue()'s result. */
export function writeQueueRow(index: number, row: QueueRow): void {
  writeRows(tab(TABS.queue), index + 2, [rowToArray(QUEUE_COLUMNS, row)]);
}

export function appendQueueRows(rows: readonly QueueRow[]): void {
  const sheet = tab(TABS.queue);
  writeRows(sheet, sheet.getLastRow() + 1, rows.map((r) => rowToArray(QUEUE_COLUMNS, r)));
}

export function readLog(): LogEntry[] {
  const sheet = tab(TABS.log);
  const from = Math.max(2, sheet.getLastRow() - LOG_TAIL_ROWS + 1);
  return readBody(sheet, LOG_COLUMNS.length, from).map((v) => arrayToRow(LOG_COLUMNS, v));
}

export function appendLog(entry: LogEntry): void {
  const sheet = tab(TABS.log);
  writeRows(sheet, sheet.getLastRow() + 1, [rowToArray(LOG_COLUMNS, entry)]);
}

export function readExclusions(): string[] {
  return readBody(tab(TABS.exclusions), 1)
    .map((v) => v[0] ?? "")
    .filter((v) => v.trim() !== "");
}

export function appendExclusion(value: string, source: string, nowIso: string): void {
  const sheet = tab(TABS.exclusions);
  writeRows(sheet, sheet.getLastRow() + 1, [[value, nowIso, source]]);
}

/** Settings tab as key → value. The first occurrence of a key wins. */
export function readSettings(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of readBody(tab(TABS.settings), 2)) {
    const k = (key ?? "").trim();
    if (k && !(k in out)) out[k] = value ?? "";
  }
  return out;
}
