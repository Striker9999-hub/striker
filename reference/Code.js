"use strict";
var Striker = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // apps-script/src/main.ts
  var main_exports = {};
  __export(main_exports, {
    doPost: () => doPost,
    limits: () => limits,
    onOpen: () => onOpen,
    strikerNewSecret: () => strikerNewSecret,
    strikerSetup: () => strikerSetup,
    strikerShowStatus: () => strikerShowStatus,
    strikerTick: () => strikerTick
  });

  // shared/limits.ts
  var MAX_DAILY_SENDS = 40;
  var DEFAULT_DAILY_SENDS = 40;
  var MIN_GAP_MINUTES = 5;
  var DEFAULT_GAP_RANGE_MINUTES = [5, 6];
  var DEFAULT_SEND_DAYS = [1, 2, 3, 4, 5];
  var DEFAULT_WINDOW_START = "09:00";
  var DEFAULT_WINDOW_END = "17:00";
  var DEFAULT_SEND_WINDOW = {
    days: DEFAULT_SEND_DAYS,
    start: DEFAULT_WINDOW_START,
    end: DEFAULT_WINDOW_END,
    fallbackTimeZone: null
  };
  function clampSendSettings(input = {}) {
    return {
      dailySends: clampDailySends(input.dailySends),
      gapRangeMinutes: clampGapRange(input.gapRangeMinutes),
      sendWindow: clampSendWindow(input.sendWindow)
    };
  }
  function clampSendWindow(value) {
    const input = isRecord(value) ? value : {};
    const [start, end] = clampWindowHours(input.start, input.end);
    return {
      days: clampDays(input.days),
      start,
      end,
      fallbackTimeZone: isValidTimeZone(input.fallbackTimeZone) ? input.fallbackTimeZone : null
    };
  }
  function clampDays(value) {
    if (!Array.isArray(value)) return DEFAULT_SEND_DAYS;
    const days = [...new Set(value)].filter((d) => DEFAULT_SEND_DAYS.includes(d)).sort((a, b) => a - b);
    return days.length > 0 ? days : DEFAULT_SEND_DAYS;
  }
  function clampWindowHours(start, end) {
    const earliest = parseTime(DEFAULT_WINDOW_START);
    const latest = parseTime(DEFAULT_WINDOW_END);
    const s = Math.max(earliest, parseTime(start) ?? earliest);
    const e = Math.min(latest, parseTime(end) ?? latest);
    if (s >= e) return [DEFAULT_WINDOW_START, DEFAULT_WINDOW_END];
    return [formatTime(s), formatTime(e)];
  }
  function parseTime(value) {
    if (typeof value !== "string") return null;
    const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
    return match ? Number(match[1]) * 60 + Number(match[2]) : null;
  }
  function formatTime(minutes) {
    const hh = String(Math.floor(minutes / 60)).padStart(2, "0");
    const mm = String(minutes % 60).padStart(2, "0");
    return `${hh}:${mm}`;
  }
  function isValidTimeZone(value) {
    if (typeof value !== "string" || value.trim() === "") return false;
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: value });
      return true;
    } catch {
      return false;
    }
  }
  function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }
  function clampDailySends(value) {
    if (!isFiniteNumber(value)) return DEFAULT_DAILY_SENDS;
    return Math.min(MAX_DAILY_SENDS, Math.max(1, Math.floor(value)));
  }
  function clampGapRange(value) {
    if (!Array.isArray(value) || value.length !== 2 || !isFiniteNumber(value[0]) || !isFiniteNumber(value[1])) {
      return DEFAULT_GAP_RANGE_MINUTES;
    }
    const low = Math.max(MIN_GAP_MINUTES, Math.min(value[0], value[1]));
    const high = Math.max(low, value[0], value[1]);
    return [low, high];
  }
  function isFiniteNumber(value) {
    return typeof value === "number" && Number.isFinite(value);
  }

  // shared/types.ts
  var QUEUE_STATUSES = [
    "queued",
    // approved and waiting (FR19)
    "scheduled",
    // the row the sender will send next
    "sending",
    // handed to Gmail; outcome not yet recorded
    "sent",
    // accepted by Google (not proof of inbox delivery)
    "failed",
    // permanent error, or temporary errors exhausted retries
    "skipped",
    // not sent on purpose; see statusReason
    "uncertain"
    // may or may not have gone out; held, never retried blindly (NFR09)
  ];
  var STATUS_REASONS = {
    notInDevAllowlist: "skipped: not in dev allowlist",
    excluded: "excluded",
    missingOptOut: "missing opt-out line",
    cancelled: "cancelled",
    invalidRecipient: "invalid recipient",
    retriesExhausted: "temporary errors: retries exhausted",
    unknownError: "unknown send error",
    stuckSending: "interrupted while sending; not found in Sent",
    contentChanged: "content_changed",
    // subject/body no longer match what was approved
    sheetsError: "sheets_error_value"
    // subject/body is a Sheets error such as #ERROR!
  };

  // apps-script/src/logic/email.ts
  function normalizeEmail(value) {
    return value.trim().toLowerCase();
  }
  var EMAIL_RE = /^[^\s@<>(),;:"[\]\\]+@[^\s@<>(),;:"[\]\\]+\.[^\s@<>(),;:"[\]\\.]{2,}$/;
  function isValidEmail(value) {
    return typeof value === "string" && value.length <= 254 && EMAIL_RE.test(value.trim());
  }

  // apps-script/src/logic/bounces.ts
  var BOUNCE_LOOKBACK_SENDS = 20;
  var BOUNCE_PAUSE_THRESHOLD = 3;
  function recentSentRecipients(log2, n = BOUNCE_LOOKBACK_SENDS) {
    return log2.filter((e) => e.status === "sent").slice(-n).map((e) => normalizeEmail(e.to));
  }
  function escapeRegExp(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  function countBouncedRecipients(recipients, bounces, ackAtMs) {
    const fresh = bounces.filter((b) => b.date > ackAtMs).map((b) => b.text.toLowerCase());
    let count = 0;
    for (const r of new Set(recipients)) {
      const re = new RegExp(`(^|[^a-z0-9._%+-])${escapeRegExp(r)}($|[^a-z0-9-]|\\.(?![a-z0-9]))`);
      if (fresh.some((t) => re.test(t))) count++;
    }
    return count;
  }
  function bounceThresholdReached(count) {
    return count >= BOUNCE_PAUSE_THRESHOLD;
  }

  // apps-script/src/logic/errors.ts
  var PATTERNS = [
    ["quota", /too many times|limit exceeded|rate limit|quota|exceeded maximum/i],
    ["auth", /authoriz|permission|access denied|access_denied|invalid_grant|not allowed to call/i],
    ["invalid_recipient", /invalid (email|argument|recipient)|no recipient|recipient.*invalid/i],
    ["temporary", /service unavailable|temporar|timed? ?out|try again|backend error|server error/i]
  ];
  function classifyError(error) {
    const message = error instanceof Error ? error.message : String(error ?? "");
    for (const [cls, re] of PATTERNS) {
      if (re.test(message)) return cls;
    }
    return "unknown";
  }
  var MAX_SEND_ATTEMPTS = 3;
  function outcomeForError(cls, attempts) {
    switch (cls) {
      case "quota":
        return { status: "queued", reason: "", pause: "quota" };
      case "auth":
        return { status: "queued", reason: "", pause: "auth" };
      case "invalid_recipient":
        return { status: "failed", reason: STATUS_REASONS.invalidRecipient, pause: null };
      case "temporary":
        return attempts >= MAX_SEND_ATTEMPTS ? { status: "failed", reason: STATUS_REASONS.retriesExhausted, pause: null } : { status: "queued", reason: "", pause: null };
      case "unknown":
        return { status: "uncertain", reason: STATUS_REASONS.unknownError, pause: null };
    }
  }

  // apps-script/src/logic/gap.ts
  var MINUTE_MS = 6e4;
  function computeNextSendAt(fromMs, gapRangeMinutes, random = Math.random) {
    const [low, high] = clampSendSettings({ gapRangeMinutes }).gapRangeMinutes;
    const r = Math.min(Math.max(random(), 0), 1);
    const minutes = Math.max(MIN_GAP_MINUTES, low + r * (high - low));
    return fromMs + Math.ceil(minutes * MINUTE_MS);
  }
  function gapPassed(nowMs, nextSendAtMs) {
    return nextSendAtMs === null || !Number.isFinite(nextSendAtMs) || nowMs >= nextSendAtMs;
  }

  // shared/optout.ts
  var OPT_OUT_LINE = "If you'd prefer not to hear from me again, just reply 'no thanks' and I won't contact you further.";
  function normalize(text) {
    return text.replace(/\s+/g, " ").trim();
  }
  function hasOptOutLine(body) {
    if (typeof body !== "string") return false;
    const wanted = normalize(OPT_OUT_LINE);
    return body.split(/\r?\n/).some((line) => normalize(line) === wanted);
  }

  // apps-script/src/logic/allowlist.ts
  function isDevModeOn(value) {
    if (value === false) return false;
    return !(typeof value === "string" && value.trim().toUpperCase() === "FALSE");
  }
  function parseAllowlist(value) {
    if (typeof value !== "string") return /* @__PURE__ */ new Set();
    return new Set(
      value.split(/[\s,;]+/).filter((v) => isValidEmail(v)).map(normalizeEmail)
    );
  }
  function isAllowedRecipient(to, devMode, allowlist) {
    if (!devMode) return true;
    return allowlist.has(normalizeEmail(to));
  }

  // apps-script/src/logic/cells.ts
  var RISKY_START = /^[=+\-@\t\r]/;
  function escapeCell(value) {
    return RISKY_START.test(value) ? `'${value}` : value;
  }
  function unescapeCell(value) {
    return value.startsWith("'") && RISKY_START.test(value.slice(1)) ? value.slice(1) : value;
  }
  var SHEETS_ERROR = /^#(ERROR!|REF!|NAME\?|VALUE!|N\/A|DIV\/0!|NUM!|NULL!|SPILL!|CALC!)$/;
  function isSheetsError(value) {
    return typeof value === "string" && SHEETS_ERROR.test(value.trim());
  }

  // apps-script/src/logic/integrity.ts
  function contentHash(subject, body, digest) {
    return digest(JSON.stringify([subject, body]));
  }
  function contentMatches(row, digest) {
    return row.contentHash !== "" && contentHash(row.subject, row.body, digest) === row.contentHash;
  }

  // apps-script/src/logic/cap.ts
  function dayKey(date, timeZone) {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(date);
  }
  var COUNTED = /* @__PURE__ */ new Set(["sending", "sent", "uncertain"]);
  function countSendsToday(log2, now, timeZone) {
    const today = dayKey(now, timeZone);
    const ids = /* @__PURE__ */ new Set();
    for (const entry of log2) {
      if (!COUNTED.has(entry.status)) continue;
      const at = new Date(entry.timestamp);
      if (Number.isNaN(at.getTime())) continue;
      if (dayKey(at, timeZone) === today) ids.add(entry.queueId);
    }
    return ids.size;
  }
  function capReached(sendsToday, dailyCap) {
    const cap = Math.min(clampSendSettings({ dailySends: dailyCap }).dailySends, MAX_DAILY_SENDS);
    return sendsToday >= cap;
  }

  // apps-script/src/logic/exclusions.ts
  var DOMAIN_RE = /^@[a-z0-9-]+(\.[a-z0-9-]+)+$/;
  function normalizeExclusion(value) {
    if (typeof value !== "string") return null;
    const v = normalizeEmail(value);
    if (DOMAIN_RE.test(v)) return v;
    if (isValidEmail(v)) return v;
    return null;
  }
  function isExcluded(to, exclusions) {
    const addr = normalizeEmail(to);
    const domain = addr.slice(addr.lastIndexOf("@"));
    return exclusions.some((raw) => {
      const e = normalizeExclusion(raw);
      return e !== null && (e === addr || e === domain);
    });
  }

  // shared/textSafety.ts
  var SUBJECT_FORBIDDEN_START = ["=", "+", "-", "@"];
  var BODY_LINE_FORBIDDEN_START = ["=", "+", "@"];
  function startsWithAny(text, chars) {
    const first = text.trimStart().charAt(0);
    return chars.includes(first) ? first : null;
  }
  function subjectProblem(subject) {
    const c = startsWithAny(subject, SUBJECT_FORBIDDEN_START);
    return c ? `Subject can't start with '${c}'. Please rephrase.` : null;
  }
  function bodyProblem(body) {
    const first = startsWithAny(body, ["-"]);
    if (first) return `The email can't start with '${first}'. Please rephrase.`;
    const lines = body.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const c = startsWithAny(lines[i], BODY_LINE_FORBIDDEN_START);
      if (c) return `Line ${i + 1} of the email can't start with '${c}'. Please rephrase.`;
    }
    return null;
  }

  // apps-script/src/logic/rows.ts
  var QUEUE_COLUMNS = [
    "id",
    "campaignId",
    "batchId",
    "approvedAt",
    "to",
    "recipientTimeZone",
    "subject",
    "body",
    "status",
    "statusReason",
    "attempts",
    "scheduledAt",
    "sentAt",
    "updatedAt",
    "contentHash"
    // FR19: hash of the approved subject + body
  ];
  var LOG_COLUMNS = ["timestamp", "queueId", "to", "status", "code"];
  var EXCLUSION_COLUMNS = ["value", "addedAt", "source"];
  var SETTINGS_COLUMNS = ["key", "value", "note"];
  function rowToArray(columns, row) {
    return columns.map((c) => row[c] ?? "");
  }
  function arrayToRow(columns, values) {
    const row = {};
    columns.forEach((c, i) => {
      row[c] = values[i] == null ? "" : String(values[i]);
    });
    return row;
  }
  function isPending(status) {
    return status === "queued" || status === "scheduled";
  }

  // apps-script/src/logic/queue.ts
  var MAX_ITEMS_PER_REQUEST = 200;
  var MAX_SUBJECT_LENGTH = 200;
  var MAX_BODY_LENGTH = 2e4;
  var MAX_ID_LENGTH = 100;
  function isRecord2(v) {
    return typeof v === "object" && v !== null && !Array.isArray(v);
  }
  function isId(v) {
    return typeof v === "string" && v.trim() !== "" && v.length <= MAX_ID_LENGTH && !/[\r\n]/.test(v);
  }
  function buildQueueRows(payload, existingIds, exclusions, now, digest) {
    if (!isRecord2(payload)) return { error: "invalid_payload" };
    const { batchId, approvedAt, items } = payload;
    if (!isId(batchId)) return { error: "invalid_batch_id" };
    if (typeof approvedAt !== "string" || Number.isNaN(Date.parse(approvedAt))) return { error: "not_approved" };
    if (!Array.isArray(items) || items.length === 0) return { error: "no_items" };
    if (items.length > MAX_ITEMS_PER_REQUEST) return { error: "too_many_items" };
    const nowIso = now.toISOString();
    const seen = new Set(existingIds);
    const rows = [];
    const result = { added: 0, duplicates: [], rejected: [] };
    for (const item of items) {
      const id = isRecord2(item) && isId(item.id) ? item.id.trim() : null;
      if (!isRecord2(item) || id === null) {
        result.rejected.push({ id: "", reason: "invalid_id" });
        continue;
      }
      if (seen.has(id)) {
        result.duplicates.push(id);
        continue;
      }
      const reason = itemProblem(item);
      if (reason) {
        result.rejected.push(reason.message ? { id, reason: reason.code, message: reason.message } : { id, reason: reason.code });
        continue;
      }
      seen.add(id);
      const to = normalizeEmail(item.to);
      const subject = item.subject.trim();
      const body = item.body;
      const excluded = isExcluded(to, exclusions);
      rows.push({
        id,
        campaignId: item.campaignId,
        batchId: batchId.trim(),
        approvedAt: new Date(approvedAt).toISOString(),
        to,
        recipientTimeZone: isValidTimeZone(item.recipientTimeZone) ? item.recipientTimeZone : "",
        subject,
        body,
        status: excluded ? "skipped" : "queued",
        statusReason: excluded ? STATUS_REASONS.excluded : "",
        attempts: "0",
        scheduledAt: "",
        sentAt: "",
        updatedAt: nowIso,
        contentHash: contentHash(subject, body, digest)
      });
      result.added++;
    }
    return { rows, result };
  }
  function itemProblem(item) {
    const code = (c) => ({ code: c });
    if (!isId(item.campaignId)) return code("invalid_campaign_id");
    if (!isValidEmail(item.to)) return code("invalid_recipient");
    if (typeof item.subject !== "string" || item.subject.trim() === "" || /[\r\n]/.test(item.subject)) {
      return code("invalid_subject");
    }
    if (item.subject.length > MAX_SUBJECT_LENGTH) return code("subject_too_long");
    if (typeof item.body !== "string" || item.body.trim() === "") return code("invalid_body");
    if (item.body.length > MAX_BODY_LENGTH) return code("body_too_long");
    if (isSheetsError(item.subject) || isSheetsError(item.body)) return code("sheets_error_value");
    const subjectMsg = subjectProblem(item.subject);
    if (subjectMsg) return { code: "unsafe_subject_start", message: subjectMsg };
    const bodyMsg = bodyProblem(item.body);
    if (bodyMsg) return { code: "unsafe_body_line_start", message: bodyMsg };
    if (!hasOptOutLine(item.body)) return code("missing_opt_out");
    return null;
  }
  function sendableIndices(rows, insideWindow) {
    const out = [];
    rows.forEach((row, i) => {
      if (isPending(row.status) && insideWindow(row)) out.push(i);
    });
    return out;
  }
  function stuckSendingIndices(rows, nowMs, afterMs) {
    const out = [];
    rows.forEach((row, i) => {
      if (row.status !== "sending") return;
      const at = Date.parse(row.updatedAt);
      if (Number.isNaN(at) || nowMs - at >= afterMs) out.push(i);
    });
    return out;
  }
  function countByStatus(rows) {
    const counts = Object.fromEntries(QUEUE_STATUSES.map((s) => [s, 0]));
    for (const row of rows) {
      if (row.status in counts) counts[row.status]++;
    }
    return counts;
  }

  // apps-script/src/logic/window.ts
  var WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  function localDayAndMinutes(now, timeZone) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23"
    }).formatToParts(now);
    const get = (type) => parts.find((p) => p.type === type)?.value ?? "";
    return {
      day: WEEKDAYS.indexOf(get("weekday")),
      minutes: Number(get("hour")) % 24 * 60 + Number(get("minute"))
    };
  }
  function resolveTimeZone(recipientTimeZone, fallbackTimeZone, userTimeZone2) {
    if (isValidTimeZone(recipientTimeZone)) return recipientTimeZone;
    if (isValidTimeZone(fallbackTimeZone)) return fallbackTimeZone;
    return userTimeZone2;
  }
  function isInsideWindow(now, window, timeZone) {
    const safe = clampSendWindow(window);
    const { day, minutes } = localDayAndMinutes(now, timeZone);
    const start = parseTime(safe.start);
    const end = parseTime(safe.end);
    return safe.days.includes(day) && minutes >= start && minutes < end;
  }

  // apps-script/src/logic/plan.ts
  function skipReason(row, settings, exclusions, digest) {
    if (isSheetsError(row.subject) || isSheetsError(row.body)) return STATUS_REASONS.sheetsError;
    if (!contentMatches(row, digest)) return STATUS_REASONS.contentChanged;
    if (isExcluded(row.to, exclusions)) return STATUS_REASONS.excluded;
    if (!isAllowedRecipient(row.to, settings.devMode, settings.allowlist)) return STATUS_REASONS.notInDevAllowlist;
    if (!hasOptOutLine(row.body)) return STATUS_REASONS.missingOptOut;
    return null;
  }
  function planTick(input) {
    const plan = { skips: [], send: null, scheduled: null, idle: null };
    if (input.paused) return { ...plan, idle: "paused" };
    const sendsToday = countSendsToday(input.log, input.now, input.userTimeZone);
    if (capReached(sendsToday, input.settings.send.dailySends)) return { ...plan, idle: "cap" };
    const { sendWindow } = input.settings.send;
    const inWindow = (row) => isInsideWindow(
      input.now,
      sendWindow,
      resolveTimeZone(row.recipientTimeZone, sendWindow.fallbackTimeZone, input.userTimeZone)
    );
    let next = null;
    for (const index of sendableIndices(input.rows, inWindow)) {
      const reason = skipReason(input.rows[index], input.settings, input.exclusions, input.digest);
      if (reason) {
        plan.skips.push({ index, reason });
        continue;
      }
      next = index;
      break;
    }
    if (next === null) return { ...plan, idle: "nothing_sendable" };
    if (!gapPassed(input.now.getTime(), input.nextSendAtMs)) return { ...plan, scheduled: next, idle: "gap" };
    return { ...plan, send: next };
  }

  // apps-script/src/logic/settings.ts
  var DEFAULT_SETTINGS_ROWS = [
    ["DEV_MODE", "TRUE", "While TRUE, only DEV_ALLOWLIST addresses receive mail. Set to FALSE by hand to send for real."],
    ["DEV_ALLOWLIST", "", "Addresses you own, separated by commas."],
    ["DAILY_SENDS", String(DEFAULT_DAILY_SENDS), `Emails per day. Maximum ${MAX_DAILY_SENDS}.`],
    ["GAP_MIN", String(DEFAULT_GAP_RANGE_MINUTES[0]), `Minutes between sends, lower bound. Minimum ${MIN_GAP_MINUTES}.`],
    ["GAP_MAX", String(DEFAULT_GAP_RANGE_MINUTES[1]), "Minutes between sends, upper bound."],
    ["WINDOW_DAYS", DEFAULT_SEND_DAYS.join(","), "Days to send (1 = Monday ... 5 = Friday). Weekdays only."],
    ["WINDOW_START", DEFAULT_WINDOW_START, `Earliest send time, HH:MM. Not before ${DEFAULT_WINDOW_START}.`],
    ["WINDOW_END", DEFAULT_WINDOW_END, `Sending stops at this time, HH:MM. Not after ${DEFAULT_WINDOW_END}.`],
    ["FALLBACK_TZ", "", "Time zone when the recipient's is unknown, e.g. Europe/London. Blank = this Sheet's time zone."]
  ];
  function num(value) {
    if (value === void 0 || value.trim() === "") return void 0;
    const n = Number(value);
    return Number.isFinite(n) ? n : void 0;
  }
  function parseSettings(values) {
    const days = values.WINDOW_DAYS?.trim() ? values.WINDOW_DAYS.split(/[\s,;]+/).filter(Boolean).map(Number) : void 0;
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
          fallbackTimeZone: values.FALLBACK_TZ?.trim() || null
        }
      }),
      devMode: isDevModeOn(values.DEV_MODE),
      allowlist: parseAllowlist(values.DEV_ALLOWLIST)
    };
  }

  // apps-script/src/digest.ts
  var sha256Hex = (text) => Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8).map((b) => ((b + 256) % 256).toString(16).padStart(2, "0")).join("");

  // apps-script/src/sender.ts
  function sendPlainText(to, subject, body) {
    GmailApp.sendEmail(to, subject, body);
  }
  function gmailDate(ms) {
    const d = new Date(ms - 24 * 60 * 60 * 1e3);
    return `${d.getUTCFullYear()}/${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
  }
  function foundInSent(to, subject, sinceMs) {
    const addr = to.toLowerCase();
    const threads = GmailApp.search(`in:sent to:${addr} after:${gmailDate(sinceMs)}`, 0, 20);
    return threads.some(
      (thread) => thread.getMessages().some(
        (m) => m.getDate().getTime() >= sinceMs - 6e4 && m.getSubject() === subject && m.getTo().toLowerCase().includes(addr)
      )
    );
  }
  function recentBounces() {
    const threads = GmailApp.search("from:(mailer-daemon OR postmaster) newer_than:7d", 0, 30);
    const out = [];
    for (const thread of threads) {
      for (const m of thread.getMessages()) {
        if (!/mailer-daemon|postmaster/i.test(m.getFrom())) continue;
        out.push({ date: m.getDate().getTime(), text: m.getPlainBody().slice(0, 2e4) });
      }
    }
    return out;
  }

  // apps-script/src/sheet.ts
  var TABS = {
    queue: "Queue",
    log: "SendLog",
    exclusions: "Exclusions",
    settings: "Settings"
  };
  var HEADERS = {
    [TABS.queue]: QUEUE_COLUMNS,
    [TABS.log]: LOG_COLUMNS,
    [TABS.exclusions]: EXCLUSION_COLUMNS,
    [TABS.settings]: SETTINGS_COLUMNS
  };
  var LOG_TAIL_ROWS = 2e3;
  var PLAIN_TEXT = "@";
  function spreadsheet() {
    return SpreadsheetApp.getActiveSpreadsheet();
  }
  function userTimeZone() {
    return spreadsheet().getSpreadsheetTimeZone();
  }
  function ensureSheets() {
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
  function tab(name) {
    const sheet = spreadsheet().getSheetByName(name);
    if (sheet) return sheet;
    ensureSheets();
    return spreadsheet().getSheetByName(name);
  }
  function writeRows(sheet, startRow, rows) {
    if (rows.length === 0) return;
    const range = sheet.getRange(startRow, 1, rows.length, rows[0].length);
    range.setNumberFormat(PLAIN_TEXT);
    range.setValues(rows.map((r) => r.map(escapeCell)));
  }
  function readBody(sheet, columns, fromRow = 2) {
    const last = sheet.getLastRow();
    if (last < fromRow) return [];
    return sheet.getRange(fromRow, 1, last - fromRow + 1, columns).getDisplayValues().map((r) => r.map(unescapeCell));
  }
  function readQueue() {
    return readBody(tab(TABS.queue), QUEUE_COLUMNS.length).map((v) => arrayToRow(QUEUE_COLUMNS, v));
  }
  function writeQueueRow(index, row) {
    writeRows(tab(TABS.queue), index + 2, [rowToArray(QUEUE_COLUMNS, row)]);
  }
  function appendQueueRows(rows) {
    const sheet = tab(TABS.queue);
    writeRows(sheet, sheet.getLastRow() + 1, rows.map((r) => rowToArray(QUEUE_COLUMNS, r)));
  }
  function readLog() {
    const sheet = tab(TABS.log);
    const from = Math.max(2, sheet.getLastRow() - LOG_TAIL_ROWS + 1);
    return readBody(sheet, LOG_COLUMNS.length, from).map((v) => arrayToRow(LOG_COLUMNS, v));
  }
  function appendLog(entry) {
    const sheet = tab(TABS.log);
    writeRows(sheet, sheet.getLastRow() + 1, [rowToArray(LOG_COLUMNS, entry)]);
  }
  function readExclusions() {
    return readBody(tab(TABS.exclusions), 1).map((v) => v[0] ?? "").filter((v) => v.trim() !== "");
  }
  function appendExclusion(value, source, nowIso) {
    const sheet = tab(TABS.exclusions);
    writeRows(sheet, sheet.getLastRow() + 1, [[value, nowIso, source]]);
  }
  function readSettings() {
    const out = {};
    for (const [key, value] of readBody(tab(TABS.settings), 2)) {
      const k = (key ?? "").trim();
      if (k && !(k in out)) out[k] = value ?? "";
    }
    return out;
  }

  // apps-script/src/logic/secret.ts
  var MIN_SECRET_LENGTH = 32;
  function secretFromUuids(a, b) {
    const secret = `${a}${b}`.replace(/-/g, "").toLowerCase();
    if (!/^[0-9a-f]+$/.test(secret) || secret.length < MIN_SECRET_LENGTH) throw new Error("weak_secret");
    return secret;
  }
  function secretsMatch(given, stored) {
    if (typeof given !== "string" || typeof stored !== "string") return false;
    if (stored.length < MIN_SECRET_LENGTH) return false;
    let diff = given.length ^ stored.length;
    for (let i = 0; i < stored.length; i++) {
      diff |= (given.charCodeAt(i) || 0) ^ stored.charCodeAt(i);
    }
    return diff === 0;
  }

  // apps-script/src/state.ts
  var KEY = {
    secret: "SECRET",
    paused: "PAUSED",
    pauseReason: "PAUSE_REASON",
    nextSendAt: "NEXT_SEND_AT",
    bounceAckAt: "BOUNCE_ACK_AT"
  };
  var PAUSE_REASONS = ["user", "quota", "auth", "bounces"];
  function props() {
    return PropertiesService.getScriptProperties();
  }
  function readMs(key) {
    const raw = props().getProperty(key);
    const n = raw === null ? Number.NaN : Number(raw);
    return Number.isFinite(n) ? n : null;
  }
  function getSecret() {
    return props().getProperty(KEY.secret);
  }
  function generateSecret() {
    const secret = secretFromUuids(Utilities.getUuid(), Utilities.getUuid());
    props().setProperty(KEY.secret, secret);
    return secret;
  }
  function isPaused() {
    return props().getProperty(KEY.paused) === "true";
  }
  function getPauseReason() {
    const r = props().getProperty(KEY.pauseReason);
    return r !== null && PAUSE_REASONS.includes(r) ? r : null;
  }
  function pause(reason) {
    props().setProperties({ [KEY.paused]: "true", [KEY.pauseReason]: reason });
  }
  function resume(nowMs, nextSendAtMs) {
    props().setProperties({
      [KEY.paused]: "false",
      [KEY.pauseReason]: "",
      [KEY.nextSendAt]: String(nextSendAtMs),
      [KEY.bounceAckAt]: String(nowMs)
    });
  }
  function getNextSendAt() {
    return readMs(KEY.nextSendAt);
  }
  function setNextSendAt(ms) {
    props().setProperty(KEY.nextSendAt, String(ms));
  }
  function getBounceAckAt() {
    return readMs(KEY.bounceAckAt) ?? 0;
  }

  // apps-script/src/scheduler.ts
  var STUCK_AFTER_MS = 10 * 6e4;
  function tick() {
    const lock = LockService.getScriptLock();
    if (!lock.tryLock(5e3)) return;
    try {
      runTick(/* @__PURE__ */ new Date());
    } finally {
      lock.releaseLock();
    }
  }
  function update(rows, index, changes, now) {
    const row = { ...rows[index], ...changes, updatedAt: now.toISOString() };
    rows[index] = row;
    writeQueueRow(index, row);
    return row;
  }
  function log(row, status, code, now) {
    appendLog({ timestamp: now.toISOString(), queueId: row.id, to: row.to, status, code });
  }
  function runTick(now) {
    const rows = readQueue();
    recoverStuckRows(rows, now);
    const settings = parseSettings(readSettings());
    const sendLog = readLog();
    const plan = planTick({
      now,
      paused: isPaused(),
      settings,
      userTimeZone: userTimeZone(),
      nextSendAtMs: getNextSendAt(),
      log: sendLog,
      rows,
      exclusions: readExclusions(),
      digest: sha256Hex
    });
    for (const { index, reason } of plan.skips) {
      const row = update(rows, index, { status: "skipped", statusReason: reason }, now);
      log(row, "skipped", reason, now);
      console.log(`skipped ${row.id}: ${reason}`);
    }
    rows.forEach((row, i) => {
      if (row.status === "scheduled" && i !== plan.scheduled) update(rows, i, { status: "queued", scheduledAt: "" }, now);
    });
    if (plan.scheduled !== null) {
      const at = new Date(getNextSendAt() ?? now.getTime()).toISOString();
      if (rows[plan.scheduled].status !== "scheduled" || rows[plan.scheduled].scheduledAt !== at) {
        update(rows, plan.scheduled, { status: "scheduled", scheduledAt: at }, now);
      }
    }
    if (plan.send === null) return;
    const bounced = countBouncedRecipients(recentSentRecipients(sendLog), recentBounces(), getBounceAckAt());
    if (bounceThresholdReached(bounced)) {
      pause("bounces");
      console.log(`auto-paused: bounces=${bounced}`);
      return;
    }
    sendOne(rows, plan.send, settings.send.gapRangeMinutes, now);
  }
  function sendOne(rows, index, gapRange, now) {
    let row = rows[index];
    const attempts = Number(row.attempts) + 1 || 1;
    if (attempts > 1 && foundInSent(row.to, row.subject, Date.parse(row.approvedAt))) {
      row = update(rows, index, { status: "sent", statusReason: "", sentAt: now.toISOString() }, now);
      log(row, "sent", "found_in_sent", now);
      return;
    }
    row = update(rows, index, { status: "sending", attempts: String(attempts), scheduledAt: "" }, now);
    log(row, "sending", "", now);
    SpreadsheetApp.flush();
    try {
      sendPlainText(row.to, row.subject, row.body);
      row = update(rows, index, { status: "sent", statusReason: "", sentAt: now.toISOString() }, now);
      log(row, "sent", "", now);
      console.log(`sent ${row.id}`);
    } catch (error) {
      const cls = classifyError(error);
      const outcome = outcomeForError(cls, attempts);
      row = update(rows, index, { status: outcome.status, statusReason: outcome.reason }, now);
      log(row, outcome.status, cls, now);
      console.log(`send error ${row.id}: ${cls}`);
      if (outcome.pause) pause(outcome.pause);
    } finally {
      setNextSendAt(computeNextSendAt(now.getTime(), gapRange));
      SpreadsheetApp.flush();
    }
  }
  function recoverStuckRows(rows, now) {
    for (const index of stuckSendingIndices(rows, now.getTime(), STUCK_AFTER_MS)) {
      const row = rows[index];
      const since = Date.parse(row.updatedAt) || Date.parse(row.approvedAt) || 0;
      if (foundInSent(row.to, row.subject, since - 6e4)) {
        log(update(rows, index, { status: "sent", statusReason: "", sentAt: row.updatedAt }, now), "sent", "found_in_sent", now);
      } else {
        const reason = STATUS_REASONS.stuckSending;
        log(update(rows, index, { status: "uncertain", statusReason: reason }, now), "uncertain", "stuck_sending", now);
      }
    }
  }

  // apps-script/src/webapp.ts
  var ACTIONS = ["addToQueue", "pause", "resume", "cancel", "getStatus", "addExclusion"];
  function isRecord3(v) {
    return typeof v === "object" && v !== null && !Array.isArray(v);
  }
  function handleRequest(body) {
    let request;
    try {
      request = JSON.parse(body);
    } catch {
      return { ok: false, error: "invalid_json" };
    }
    if (!isRecord3(request) || !secretsMatch(request.secret, getSecret())) {
      return { ok: false, error: "unauthorized" };
    }
    const action = request.action;
    if (!ACTIONS.includes(action)) return { ok: false, error: "unknown_action" };
    if (action === "getStatus") {
      try {
        return { ok: true, data: getStatus(/* @__PURE__ */ new Date()) };
      } catch {
        console.log("request failed: getStatus");
        return { ok: false, error: "internal_error" };
      }
    }
    const lock = LockService.getScriptLock();
    if (!lock.tryLock(1e4)) return { ok: false, error: "busy" };
    try {
      const now = /* @__PURE__ */ new Date();
      switch (action) {
        case "addToQueue":
          return addToQueue(request.payload, now);
        case "pause":
          pause("user");
          return { ok: true, data: getStatus(now) };
        case "resume":
          return resume2(now);
        case "cancel":
          return cancel(request.payload, now);
        case "addExclusion":
          return addExclusion(request.payload, now);
      }
    } catch {
      console.log(`request failed: ${action}`);
      return { ok: false, error: "internal_error" };
    } finally {
      lock.releaseLock();
    }
  }
  function addToQueue(payload, now) {
    const existing = new Set(readQueue().map((r) => r.id));
    const built = buildQueueRows(payload, existing, readExclusions(), now, sha256Hex);
    if ("error" in built) return { ok: false, error: built.error };
    appendQueueRows(built.rows);
    for (const row of built.rows) {
      if (row.status === "skipped") {
        appendLog({ timestamp: now.toISOString(), queueId: row.id, to: row.to, status: "skipped", code: row.statusReason });
      }
    }
    console.log(`queued ${built.result.added}, duplicates ${built.result.duplicates.length}, rejected ${built.result.rejected.length}`);
    return { ok: true, data: built.result };
  }
  function resume2(now) {
    const gap = parseSettings(readSettings()).send.gapRangeMinutes;
    resume(now.getTime(), computeNextSendAt(now.getTime(), gap));
    return { ok: true, data: getStatus(now) };
  }
  function skipPending(match, reason, now) {
    let count = 0;
    readQueue().forEach((row, i) => {
      if (!isPending(row.status) || !match(row)) return;
      const updated = { ...row, status: "skipped", statusReason: reason, scheduledAt: "", updatedAt: now.toISOString() };
      writeQueueRow(i, updated);
      appendLog({ timestamp: now.toISOString(), queueId: row.id, to: row.to, status: "skipped", code: reason });
      count++;
    });
    return count;
  }
  function cancel(payload, now) {
    const campaignId = isRecord3(payload) && typeof payload.campaignId === "string" ? payload.campaignId : null;
    const cancelled = skipPending((r) => campaignId === null || r.campaignId === campaignId, STATUS_REASONS.cancelled, now);
    return { ok: true, data: { cancelled } };
  }
  function addExclusion(payload, now) {
    const value = normalizeExclusion(isRecord3(payload) ? payload.value : void 0);
    if (value === null) return { ok: false, error: "invalid_exclusion" };
    if (!readExclusions().some((e) => normalizeExclusion(e) === value)) {
      appendExclusion(value, "extension", now.toISOString());
    }
    const skipped = skipPending((r) => isExcluded(r.to, [value]), STATUS_REASONS.excluded, now);
    return { ok: true, data: { value, skipped } };
  }
  function getStatus(now) {
    const settings = parseSettings(readSettings());
    const next = getNextSendAt();
    const paused = isPaused();
    return {
      counts: countByStatus(readQueue()),
      sentToday: countSendsToday(readLog(), now, userTimeZone()),
      dailyCap: settings.send.dailySends,
      paused,
      pauseReason: paused ? getPauseReason() : null,
      nextSendAt: next === null ? null : new Date(next).toISOString(),
      devMode: settings.devMode
    };
  }

  // apps-script/src/main.ts
  var limits = {
    MAX_DAILY_SENDS,
    DEFAULT_DAILY_SENDS,
    MIN_GAP_MINUTES,
    DEFAULT_GAP_RANGE_MINUTES,
    DEFAULT_SEND_WINDOW
  };
  var TICK_HANDLER = "strikerTick";
  function doPost(e) {
    const response = handleRequest(e?.postData?.contents ?? "");
    return ContentService.createTextOutput(JSON.stringify(response)).setMimeType(ContentService.MimeType.JSON);
  }
  function strikerTick() {
    tick();
  }
  function onOpen() {
    SpreadsheetApp.getUi().createMenu("Striker").addItem("Set up / repair", "strikerSetup").addItem("Show status", "strikerShowStatus").addSeparator().addItem("Generate new secret", "strikerNewSecret").addToUi();
  }
  function strikerSetup() {
    ensureSheets();
    for (const trigger of ScriptApp.getProjectTriggers()) {
      if (trigger.getHandlerFunction() === TICK_HANDLER) ScriptApp.deleteTrigger(trigger);
    }
    ScriptApp.newTrigger(TICK_HANDLER).timeBased().everyMinutes(1).create();
    if (getSecret()) {
      SpreadsheetApp.getUi().alert(
        "Striker is set up. A secret already exists. If you lost it, use Striker → Generate new secret."
      );
    } else {
      showSecret(generateSecret());
    }
  }
  function strikerNewSecret() {
    const ui = SpreadsheetApp.getUi();
    const answer = ui.alert(
      "Generate a new secret?",
      "The extension stops working until you paste the new secret into it.",
      ui.ButtonSet.OK_CANCEL
    );
    if (answer === ui.Button.OK) showSecret(generateSecret());
  }
  function showSecret(secret) {
    SpreadsheetApp.getUi().alert(
      "Striker setup secret",
      `${secret}

Copy this into the Striker extension. It will not be shown again.`,
      SpreadsheetApp.getUi().ButtonSet.OK
    );
  }
  var PAUSE_HELP = {
    user: "Paused by you.",
    quota: "Paused: Google reported a sending limit. Resume tomorrow.",
    auth: "Paused: authorization was revoked. Run Striker → Set up / repair to re-authorize, then resume.",
    bounces: "Paused: 3 or more of the last 20 emails bounced. Check your contact list before resuming."
  };
  function strikerShowStatus() {
    const s = getStatus(/* @__PURE__ */ new Date());
    const lines = [
      s.paused ? PAUSE_HELP[s.pauseReason ?? "user"] : "Running.",
      `DEV_MODE: ${s.devMode ? "ON (allowlist only)" : "OFF"}`,
      `Sent today: ${s.sentToday} of ${s.dailyCap}`,
      `Next send no earlier than: ${s.nextSendAt ?? "now"}`,
      "",
      ...Object.entries(s.counts).map(([status, n]) => `${status}: ${n}`)
    ];
    SpreadsheetApp.getUi().alert("Striker status", lines.join("\n"), SpreadsheetApp.getUi().ButtonSet.OK);
  }
  return __toCommonJS(main_exports);
})();
function doPost(e) { return Striker.doPost(e); }
function onOpen(e) { return Striker.onOpen(e); }
function strikerTick(e) { return Striker.strikerTick(e); }
function strikerSetup(e) { return Striker.strikerSetup(e); }
function strikerShowStatus(e) { return Striker.strikerShowStatus(e); }
function strikerNewSecret(e) { return Striker.strikerNewSecret(e); }
