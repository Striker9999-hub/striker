/** Values that Sheets would treat as a formula get a leading apostrophe. */
const RISKY_START = /^[=+\-@\t\r]/;

export function escapeCell(value: string): string {
  return RISKY_START.test(value) ? `'${value}` : value;
}

export function unescapeCell(value: string): string {
  return value.startsWith("'") && RISKY_START.test(value.slice(1)) ? value.slice(1) : value;
}

const SHEETS_ERROR = /^#(ERROR!|REF!|NAME\?|VALUE!|N\/A|DIV\/0!|NUM!|NULL!|SPILL!|CALC!)$/;

export function isSheetsError(value: unknown): boolean {
  return typeof value === "string" && SHEETS_ERROR.test(value.trim());
}
