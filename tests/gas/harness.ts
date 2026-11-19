/**
 * A small, deterministic fake of the Apps Script services Striker uses.
 *
 * A bundle (reference/Code.js or the rebuilt one) runs inside its own `vm`
 * context with a controllable clock, seeded Math.random, an in-memory
 * spreadsheet, script properties, lock, Gmail mailbox and UI. Everything the
 * bundle does is observable through `snapshot()`, so two bundles can be driven
 * through the same script and compared step by step.
 */
import { createHash } from "node:crypto";
import vm from "node:vm";

export interface MailMessage {
  date: number;
  from: string;
  to: string;
  subject: string;
  body: string;
}

export interface Snapshot {
  sheets: Record<string, string[][]>;
  frozen: Record<string, number>;
  props: Record<string, string>;
  sent: MailMessage[];
  triggers: string[];
  alerts: unknown[][];
  menus: unknown[];
  logs: string[];
  gmailQueries: string[];
  numberFormats: string[];
}

/** A Queue row as the Sheet shows it (all columns present as strings). */
export type QueueRowView = Record<string, string> & {
  id: string;
  to: string;
  subject: string;
  body: string;
  status: string;
  updatedAt: string;
};

export type SendBehaviour =
  | { kind: "ok" }
  | { kind: "throw"; message: string }
  /** Gmail accepted the email but the call still threw (e.g. a timeout). */
  | { kind: "deliverThenThrow"; message: string };

export interface RuntimeOptions {
  startMs: number;
  seed: number;
  timeZone?: string;
  me?: string;
}

/** Mulberry32: small seeded PRNG. */
export function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class FakeSheet {
  data: string[][] = [];
  frozenRows = 0;
  constructor(
    public name: string,
    private formats: string[],
  ) {}
  getLastRow() {
    for (let i = this.data.length - 1; i >= 0; i--) {
      if (this.data[i]?.some((v) => v !== "")) return i + 1;
    }
    return 0;
  }
  getLastColumn() {
    let max = 0;
    for (const row of this.data) {
      for (let c = row.length - 1; c >= 0; c--) {
        if (row[c] !== "") {
          max = Math.max(max, c + 1);
          break;
        }
      }
    }
    return max;
  }
  setFrozenRows(n: number) {
    this.frozenRows = n;
  }
  getRange(row: number, col: number, numRows: number, numCols: number) {
    if (row < 1 || col < 1 || numRows < 1 || numCols < 1) throw new Error(`bad range ${row},${col},${numRows},${numCols}`);
    const sheet = this;
    return {
      setNumberFormat(f: string) {
        sheet.formats.push(`${sheet.name}!R${row}C${col}:${numRows}x${numCols}=${f}`);
        return this;
      },
      setValues(values: unknown[][]) {
        if (values.length !== numRows || values.some((r) => r.length !== numCols)) {
          throw new Error("The number of rows or columns in the data does not match the range.");
        }
        values.forEach((r, i) => {
          const target = (sheet.data[row - 1 + i] ??= []);
          r.forEach((v, j) => {
            while (target.length < col - 1 + j) target.push("");
            target[col - 1 + j] = String(v);
          });
        });
        for (let i = 0; i < sheet.data.length; i++) sheet.data[i] ??= [];
        return this;
      },
      getDisplayValues() {
        const out: string[][] = [];
        for (let i = 0; i < numRows; i++) {
          const src = sheet.data[row - 1 + i] ?? [];
          const r: string[] = [];
          for (let j = 0; j < numCols; j++) r.push(src[col - 1 + j] ?? "");
          out.push(r);
        }
        return out;
      },
    };
  }
}

export class GasRuntime {
  now: number;
  random: () => number;
  timeZone: string;
  me: string;
  sheets = new Map<string, FakeSheet>();
  props = new Map<string, string>();
  sent: MailMessage[] = [];
  inbox: MailMessage[] = [];
  triggers: string[] = [];
  alerts: unknown[][] = [];
  menus: unknown[] = [];
  logs: string[] = [];
  gmailQueries: string[] = [];
  numberFormats: string[] = [];
  sendBehaviours: SendBehaviour[] = [];
  lockAvailable = true;
  alertAnswer = "OK";
  uuidCounter = 0;
  private ctx: vm.Context;
  private ctxError: ErrorConstructor;
  private ctxDate: DateConstructor;

  constructor(code: string, opts: RuntimeOptions) {
    this.now = opts.startMs;
    this.random = prng(opts.seed);
    this.timeZone = opts.timeZone ?? "America/New_York";
    this.me = opts.me ?? "me@example.com";
    this.ctx = vm.createContext({});
    vm.runInContext(
      `(() => {
        const RealDate = Date;
        class FakeDate extends RealDate {
          constructor(...args) { if (args.length === 0) super(__host.now); else super(...args); }
          static now() { return __host.now; }
        }
        globalThis.Date = FakeDate;
        Math.random = () => __host.random();
      })();`,
      Object.assign(this.ctx, { __host: this }),
    );
    this.ctxError = vm.runInContext("Error", this.ctx);
    this.ctxDate = vm.runInContext("Date", this.ctx);
    Object.assign(this.ctx, this.services());
    vm.runInContext(code, this.ctx, { filename: "Code.js" });
  }

  /** Calls a top-level Apps Script function, like a trigger or menu would. */
  call(name: string, arg?: unknown): unknown {
    const fn = vm.runInContext(`typeof ${name} === "function" ? ${name} : undefined`, this.ctx);
    if (!fn) throw new Error(`no global function ${name}`);
    try {
      return { result: plain(fn(arg)) };
    } catch (error) {
      return { threw: (error as { message?: string } | null)?.message ?? String(error) };
    }
  }

  /** Evaluates an expression inside the bundle's realm (for the exported API). */
  eval(expr: string): unknown {
    return plain(vm.runInContext(expr, this.ctx));
  }

  doPost(body: unknown): unknown {
    const contents = typeof body === "string" ? body : JSON.stringify(body);
    const out = this.call("doPost", { postData: { contents } }) as { result?: { content: string; mime: string } };
    return out.result ? { mime: out.result.mime, response: JSON.parse(out.result.content) } : out;
  }

  sheet(name: string): FakeSheet | undefined {
    return this.sheets.get(name);
  }

  setSetting(key: string, value: string): void {
    const s = this.sheets.get("Settings");
    if (!s) throw new Error("no Settings sheet");
    const row = s.data.find((r) => r[0] === key);
    if (row) row[1] = value;
    else s.data.push([key, value, ""]);
  }

  /** Writes a queue cell directly, as a user editing the Sheet would. */
  setQueueCell(rowIndex: number, column: string, value: string): void {
    const s = this.sheets.get("Queue")!;
    const col = s.data[0]!.indexOf(column);
    if (col < 0) throw new Error(`no column ${column}`);
    s.data[rowIndex + 1]![col] = value;
  }

  queueRows(): QueueRowView[] {
    const s = this.sheets.get("Queue");
    if (!s || s.data.length < 2) return [];
    const header = s.data[0]!;
    return s.data.slice(1).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])) as QueueRowView);
  }

  addBounce(text: string, from = "Mail Delivery Subsystem <mailer-daemon@googlemail.com>"): void {
    this.inbox.push({ date: this.now, from, to: this.me, subject: "Delivery Status Notification (Failure)", body: text });
  }

  /** Puts a message in Sent without going through the bundle (an interrupted send that did go out). */
  addSent(to: string, subject: string, date = this.now): void {
    this.sent.push({ date, from: this.me, to, subject, body: "" });
  }

  snapshot(): Snapshot {
    return {
      sheets: Object.fromEntries([...this.sheets].map(([k, s]) => [k, s.data.map((r) => [...r])])),
      frozen: Object.fromEntries([...this.sheets].map(([k, s]) => [k, s.frozenRows])),
      props: Object.fromEntries([...this.props].sort()),
      sent: this.sent.map((m) => ({ ...m })),
      triggers: [...this.triggers],
      alerts: this.alerts.map((a) => [...a]),
      menus: [...this.menus],
      logs: [...this.logs],
      gmailQueries: [...this.gmailQueries],
      numberFormats: [...this.numberFormats],
    };
  }

  private message(m: MailMessage) {
    const D = this.ctxDate;
    return {
      getDate: () => new D(m.date),
      getSubject: () => m.subject,
      getTo: () => m.to,
      getFrom: () => m.from,
      getPlainBody: () => m.body,
    };
  }

  private search(query: string, start: number, max: number) {
    this.gmailQueries.push(`${query} [${start},${max}]`);
    let messages: MailMessage[] = [];
    const sentMatch = /^in:sent to:(\S+) after:(\d+)\/(\d+)\/(\d+)$/.exec(query);
    if (sentMatch) {
      const after = Date.UTC(Number(sentMatch[2]), Number(sentMatch[3]) - 1, Number(sentMatch[4]));
      messages = this.sent.filter((m) => m.to.toLowerCase().includes(sentMatch[1]!) && m.date >= after);
    } else if (query === "from:(mailer-daemon OR postmaster) newer_than:7d") {
      messages = this.inbox.filter(
        (m) => /mailer-daemon|postmaster/i.test(m.from) && m.date >= this.now - 7 * 86_400_000,
      );
    } else {
      throw new Error(`unsupported Gmail query: ${query}`);
    }
    return messages
      .slice()
      .reverse()
      .slice(start, start + max)
      .map((m) => ({ getMessages: () => [this.message(m)] }));
  }

  private services() {
    const host = this;
    const ui = {
      ButtonSet: { OK: "OK", OK_CANCEL: "OK_CANCEL" },
      Button: { OK: "OK", CANCEL: "CANCEL" },
      alert: (...args: unknown[]) => {
        host.alerts.push(args);
        return host.alertAnswer;
      },
      createMenu: (title: string) => {
        const items: unknown[] = [];
        const menu = {
          addItem: (label: string, fn: string) => (items.push([label, fn]), menu),
          addSeparator: () => (items.push("---"), menu),
          addToUi: () => void host.menus.push({ title, items }),
        };
        return menu;
      },
    };
    const spreadsheet = {
      getSheetByName: (name: string) => host.sheets.get(name) ?? null,
      insertSheet: (name: string) => {
        if (host.sheets.has(name)) throw new host.ctxError(`A sheet with the name "${name}" already exists.`);
        const s = new FakeSheet(name, host.numberFormats);
        host.sheets.set(name, s);
        return s;
      },
      getSpreadsheetTimeZone: () => host.timeZone,
    };
    return {
      console: { log: (...a: unknown[]) => void host.logs.push(a.map(String).join(" ")) },
      SpreadsheetApp: {
        getActiveSpreadsheet: () => spreadsheet,
        getUi: () => ui,
        flush: () => undefined,
      },
      PropertiesService: {
        getScriptProperties: () => ({
          getProperty: (k: string) => (host.props.has(k) ? host.props.get(k)! : null),
          setProperty: (k: string, v: string) => void host.props.set(k, String(v)),
          setProperties: (o: Record<string, string>) => {
            for (const [k, v] of Object.entries(o)) host.props.set(k, String(v));
          },
        }),
      },
      LockService: {
        getScriptLock: () => ({
          tryLock: () => host.lockAvailable,
          releaseLock: () => undefined,
        }),
      },
      Utilities: {
        DigestAlgorithm: { SHA_256: "SHA_256" },
        Charset: { UTF_8: "UTF_8" },
        computeDigest: (alg: string, text: string, charset: string) => {
          if (alg !== "SHA_256" || charset !== "UTF_8") throw new Error("unexpected digest args");
          return [...createHash("sha256").update(text, "utf8").digest()].map((b) => (b > 127 ? b - 256 : b));
        },
        getUuid: () => {
          const h = createHash("sha256").update(`uuid-${host.uuidCounter++}`).digest("hex");
          return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
        },
      },
      GmailApp: {
        sendEmail: (to: string, subject: string, body: string) => {
          const b = host.sendBehaviours.shift() ?? { kind: "ok" };
          if (b.kind === "throw") throw new host.ctxError(b.message);
          host.sent.push({ date: host.now, from: host.me, to, subject, body });
          if (b.kind === "deliverThenThrow") throw new host.ctxError(b.message);
        },
        search: (q: string, start: number, max: number) => host.search(q, start, max),
      },
      ScriptApp: {
        getProjectTriggers: () => host.triggers.map((h) => ({ getHandlerFunction: () => h, __h: h })),
        deleteTrigger: (t: { __h: string }) => {
          const i = host.triggers.indexOf(t.__h);
          if (i >= 0) host.triggers.splice(i, 1);
        },
        newTrigger: (handler: string) => ({
          timeBased: () => ({
            everyMinutes: (n: number) => ({
              create: () => void host.triggers.push(`${handler}@${n}m`.replace(/@1m$/, "")),
            }),
          }),
        }),
      },
      ContentService: {
        MimeType: { JSON: "JSON" },
        createTextOutput: (content: string) => {
          const out = {
            content,
            mime: "TEXT",
            setMimeType(m: string) {
              out.mime = m;
              return out;
            },
          };
          return out;
        },
      },
    };
  }
}

/** Copies a value out of the vm realm into plain host data. */
function plain(v: unknown): unknown {
  if (v === undefined) return undefined;
  if (typeof v === "object" && v !== null && "content" in v && "mime" in v) {
    return { content: (v as { content: string }).content, mime: (v as { mime: string }).mime };
  }
  return JSON.parse(JSON.stringify(v ?? null));
}
