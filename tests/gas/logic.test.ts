import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { isAllowedRecipient, isDevModeOn, parseAllowlist } from "@/apps-script/src/logic/allowlist";
import { countBouncedRecipients, bounceThresholdReached, recentSentRecipients } from "@/apps-script/src/logic/bounces";
import { capReached, countSendsToday } from "@/apps-script/src/logic/cap";
import { escapeCell, isSheetsError, unescapeCell } from "@/apps-script/src/logic/cells";
import { isValidEmail } from "@/apps-script/src/logic/email";
import { classifyError, outcomeForError } from "@/apps-script/src/logic/errors";
import { isExcluded, normalizeExclusion } from "@/apps-script/src/logic/exclusions";
import { computeNextSendAt, gapPassed } from "@/apps-script/src/logic/gap";
import { contentHash } from "@/apps-script/src/logic/integrity";
import { type PlanInput, planTick } from "@/apps-script/src/logic/plan";
import { buildQueueRows, countByStatus, stuckSendingIndices } from "@/apps-script/src/logic/queue";
import type { LogEntry, QueueRow } from "@/apps-script/src/logic/rows";
import { secretFromUuids, secretsMatch } from "@/apps-script/src/logic/secret";
import { parseSettings } from "@/apps-script/src/logic/settings";
import { isInsideWindow, resolveTimeZone } from "@/apps-script/src/logic/window";
import { DEFAULT_SEND_WINDOW } from "@/shared/limits";
import { OPT_OUT_LINE } from "@/shared/optout";

const digest = (t: string) => createHash("sha256").update(t).digest("hex");
const BODY = `Hi,\n\nHello.\n\n${OPT_OUT_LINE}`;
const MIN = 60_000;

function row(over: Partial<QueueRow> = {}): QueueRow {
  const subject = over.subject ?? "Hello";
  const body = over.body ?? BODY;
  return {
    id: "r1",
    campaignId: "c1",
    batchId: "b1",
    approvedAt: "2026-11-16T12:00:00.000Z",
    to: "a@acme.example",
    recipientTimeZone: "",
    subject,
    body,
    status: "queued",
    statusReason: "",
    attempts: "0",
    scheduledAt: "",
    sentAt: "",
    updatedAt: "2026-11-16T12:00:00.000Z",
    contentHash: contentHash(subject, body, digest),
    ...over,
  };
}

function logEntry(over: Partial<LogEntry>): LogEntry {
  return { timestamp: "2026-11-16T15:00:00.000Z", queueId: "q", to: "a@x.example", status: "sent", code: "", ...over };
}

describe("secret", () => {
  const stored = "a".repeat(64);
  it("matches only the exact secret", () => {
    expect(secretsMatch(stored, stored)).toBe(true);
    expect(secretsMatch(stored.slice(1), stored)).toBe(false);
    expect(secretsMatch(`${stored}a`, stored)).toBe(false);
    expect(secretsMatch(`b${stored.slice(1)}`, stored)).toBe(false);
    expect(secretsMatch(undefined, stored)).toBe(false);
  });
  it("rejects everything while the stored secret is missing or short", () => {
    expect(secretsMatch("", null)).toBe(false);
    expect(secretsMatch("abc", "abc")).toBe(false);
  });
  it("builds 64 hex chars from two UUIDs", () => {
    const s = secretFromUuids("123e4567-e89b-42d3-a456-426614174000", "AAAAAAAA-BBBB-4CCC-8DDD-EEEEEEEEEEEE");
    expect(s).toMatch(/^[0-9a-f]{64}$/);
    expect(() => secretFromUuids("x", "y")).toThrow("weak_secret");
  });
});

describe("errors", () => {
  it.each([
    ["Service invoked too many times for one day: email.", "quota"],
    ["Authorization is required to perform that action.", "auth"],
    ["Invalid email: x", "invalid_recipient"],
    ["Service unavailable: try again", "temporary"],
    ["???", "unknown"],
  ])("%s → %s", (msg, cls) => {
    expect(classifyError(new Error(msg))).toBe(cls);
  });
  it("retries temporary errors at most 3 times and holds unknown ones", () => {
    expect(outcomeForError("temporary", 2)).toEqual({ status: "queued", reason: "", pause: null });
    expect(outcomeForError("temporary", 3).status).toBe("failed");
    expect(outcomeForError("unknown", 1).status).toBe("uncertain");
    expect(outcomeForError("quota", 1)).toMatchObject({ status: "queued", pause: "quota" });
  });
});

describe("bounces", () => {
  const recips = ["bob@x.example", "amy@y.example", "cy@z.example"];
  it("counts distinct recipients named in fresh bounces only", () => {
    const bounces = [
      { date: 10, text: "Delivery to BOB@x.example failed" },
      { date: 10, text: "<amy@y.example>: 550" },
      { date: 10, text: "jimbob@x.example and cy@z.example.au" },
      { date: 1, text: "cy@z.example" },
    ];
    // cy@z.example counts because of "cy@z.example.au": see the known quirk in bounces.ts.
    expect(countBouncedRecipients(recips, bounces, 5)).toBe(3);
    expect(countBouncedRecipients(recips, [{ date: 10, text: "jimbob@x.example" }], 5)).toBe(0);
    expect(countBouncedRecipients(recips, [{ date: 10, text: "x.bob@x.example" }], 5)).toBe(0);
    expect(countBouncedRecipients(recips, [{ date: 1, text: "bob@x.example" }], 5)).toBe(0);
    expect(bounceThresholdReached(3)).toBe(true);
    expect(bounceThresholdReached(2)).toBe(false);
  });
  it("looks at the last 20 sent entries", () => {
    const log = Array.from({ length: 25 }, (_, i) => logEntry({ to: `U${i}@x.example` }));
    log.push(logEntry({ status: "failed", to: "f@x.example" }));
    const r = recentSentRecipients(log);
    expect(r).toHaveLength(20);
    expect(r[0]).toBe("u5@x.example");
  });
});

describe("cells, email, exclusions, allowlist", () => {
  it("escapes formula-like cells reversibly", () => {
    for (const v of ["=1+1", "+x", "-y", "@z", "\tt", "plain", "'quoted"]) expect(unescapeCell(escapeCell(v))).toBe(v);
    expect(escapeCell("=1")).toBe("'=1");
    expect(isSheetsError(" #REF! ")).toBe(true);
    expect(isSheetsError("#HASHTAG")).toBe(false);
  });
  it("validates email format strictly", () => {
    expect(isValidEmail("a.b+c@sub.example.org")).toBe(true);
    for (const v of ["a@b", "a@b.c", "a b@c.de", '"q"@c.de', "<a@b.de>", "a@b.de,c@d.ef"]) expect(isValidEmail(v)).toBe(false);
  });
  it("excludes addresses and whole domains", () => {
    expect(normalizeExclusion(" @Acme.Example ")).toBe("@acme.example");
    expect(normalizeExclusion("nope")).toBeNull();
    expect(isExcluded("X@Acme.example", ["@acme.example"])).toBe(true);
    expect(isExcluded("x@sub.acme.example", ["@acme.example"])).toBe(false);
    expect(isExcluded("x@b.example", ["garbage", "X@B.example"])).toBe(true);
  });
  it("dev mode fails safe", () => {
    expect(isDevModeOn("FALSE")).toBe(false);
    expect(isDevModeOn(" false ")).toBe(false);
    for (const v of ["TRUE", "", "no", "fasle", undefined]) expect(isDevModeOn(v)).toBe(true);
    const allow = parseAllowlist("a@x.example; B@x.example, junk");
    expect([...allow]).toEqual(["a@x.example", "b@x.example"]);
    expect(isAllowedRecipient("b@X.example", true, allow)).toBe(true);
    expect(isAllowedRecipient("c@x.example", true, allow)).toBe(false);
    expect(isAllowedRecipient("c@x.example", false, allow)).toBe(true);
  });
});

describe("gap", () => {
  it("is 5–6 minutes by default and never under 5", () => {
    expect(computeNextSendAt(0, [5, 6], () => 0)).toBe(5 * MIN);
    expect(computeNextSendAt(0, [5, 6], () => 0.999999)).toBeLessThanOrEqual(6 * MIN);
    expect(computeNextSendAt(0, [1, 2], () => 0.5)).toBe(5 * MIN);
    expect(computeNextSendAt(0, [5, 6], () => -3)).toBe(5 * MIN);
    expect(computeNextSendAt(0, [5, 6], () => 7)).toBe(6 * MIN);
  });
  it("treats a missing or broken next-send time as passed", () => {
    expect(gapPassed(10, null)).toBe(true);
    expect(gapPassed(10, Number.NaN)).toBe(true);
    expect(gapPassed(10, 11)).toBe(false);
  });
});

describe("window and cap", () => {
  // Monday 16 Nov 2026 14:30 UTC = 09:30 New York = 23:30 Tokyo.
  const now = new Date(Date.UTC(2026, 10, 16, 14, 30));
  it("uses the recipient's time zone, then fallback, then the Sheet's", () => {
    expect(resolveTimeZone("Asia/Tokyo", "Europe/London", "UTC")).toBe("Asia/Tokyo");
    expect(resolveTimeZone("bogus", "Europe/London", "UTC")).toBe("Europe/London");
    expect(resolveTimeZone("", null, "UTC")).toBe("UTC");
    expect(isInsideWindow(now, DEFAULT_SEND_WINDOW, "America/New_York")).toBe(true);
    expect(isInsideWindow(now, DEFAULT_SEND_WINDOW, "Asia/Tokyo")).toBe(false);
  });
  it("end time is exclusive and windows can't widen", () => {
    const fivePm = new Date(Date.UTC(2026, 10, 16, 22, 0));
    expect(isInsideWindow(fivePm, DEFAULT_SEND_WINDOW, "America/New_York")).toBe(false);
    expect(isInsideWindow(fivePm, { ...DEFAULT_SEND_WINDOW, end: "23:00" }, "America/New_York")).toBe(false);
    const saturday = new Date(Date.UTC(2026, 10, 21, 15, 0));
    expect(isInsideWindow(saturday, { ...DEFAULT_SEND_WINDOW, days: [6] }, "America/New_York")).toBe(false);
  });
  it("counts sending/sent/uncertain once per row per local day, capped at 40", () => {
    const log = [
      logEntry({ queueId: "a", status: "sending", timestamp: "2026-11-16T15:00:00Z" }),
      logEntry({ queueId: "a", status: "sent", timestamp: "2026-11-16T15:00:01Z" }),
      logEntry({ queueId: "b", status: "uncertain", timestamp: "2026-11-16T16:00:00Z" }),
      logEntry({ queueId: "c", status: "failed", timestamp: "2026-11-16T16:00:00Z" }),
      logEntry({ queueId: "d", status: "sent", timestamp: "2026-11-16T04:00:00Z" }), // Sunday evening in NY
      logEntry({ queueId: "e", status: "sent", timestamp: "garbage" }),
    ];
    expect(countSendsToday(log, now, "America/New_York")).toBe(2);
    expect(capReached(2, 2)).toBe(true);
    expect(capReached(39, 1000)).toBe(false);
    expect(capReached(40, 1000)).toBe(true);
  });
});

describe("queue", () => {
  const now = new Date("2026-11-16T15:00:00Z");
  const payload = (items: unknown[]) => ({ batchId: "b1", approvedAt: "2026-11-16T14:00:00Z", items });
  const item = (over: Record<string, unknown> = {}) => ({ id: "i1", campaignId: "c1", to: "A@acme.example", subject: " Hi ", body: BODY, ...over });

  it("rejects bad requests as a whole", () => {
    expect(buildQueueRows(null, [], [], now, digest)).toEqual({ error: "invalid_payload" });
    expect(buildQueueRows({ ...payload([item()]), approvedAt: "x" }, [], [], now, digest)).toEqual({ error: "not_approved" });
    expect(buildQueueRows(payload([]), [], [], now, digest)).toEqual({ error: "no_items" });
  });

  it("builds rows, rejects bad items and reports duplicates", () => {
    const built = buildQueueRows(
      payload([item(), item(), item({ id: "i2", body: "no opt out" }), item({ id: "i3", subject: "=x" }), item({ id: "i4", to: "z@blocked.example" })]),
      ["old"],
      ["@blocked.example"],
      now,
      digest,
    );
    if ("error" in built) throw new Error(built.error);
    expect(built.result).toEqual({
      added: 2,
      duplicates: ["i1"],
      rejected: [
        { id: "i2", reason: "missing_opt_out" },
        { id: "i3", reason: "unsafe_subject_start", message: "Subject can't start with '='. Please rephrase." },
      ],
    });
    expect(built.rows[0]).toMatchObject({ to: "a@acme.example", subject: "Hi", status: "queued", attempts: "0" });
    expect(built.rows[0]!.contentHash).toBe(contentHash("Hi", BODY, digest));
    expect(built.rows[1]).toMatchObject({ status: "skipped", statusReason: "excluded" });
  });

  it("finds stuck sends and counts statuses", () => {
    const nowMs = Date.parse("2026-11-16T12:10:00Z");
    const rows = [row({ status: "sending" }), row({ status: "sending", updatedAt: "2026-11-16T12:05:00Z" }), row({ status: "sending", updatedAt: "" })];
    expect(stuckSendingIndices(rows, nowMs, 10 * MIN)).toEqual([0, 2]);
    expect(countByStatus([...rows, row({ status: "odd" })])).toMatchObject({ sending: 3, queued: 0 });
  });
});

describe("planTick", () => {
  const settings = parseSettings({ DEV_MODE: "FALSE" });
  const base: PlanInput = {
    now: new Date(Date.UTC(2026, 10, 16, 15, 0)), // Mon 10:00 NY
    paused: false,
    settings,
    userTimeZone: "America/New_York",
    nextSendAtMs: null,
    log: [],
    rows: [],
    exclusions: [],
    digest,
  };

  it("idles when paused, capped or empty", () => {
    expect(planTick({ ...base, paused: true }).idle).toBe("paused");
    const log = Array.from({ length: 40 }, (_, i) => logEntry({ queueId: `q${i}` }));
    expect(planTick({ ...base, log, rows: [row()] }).idle).toBe("cap");
    expect(planTick(base).idle).toBe("nothing_sendable");
  });

  it("skips unsafe rows before the first sendable one and respects the gap", () => {
    const rows = [
      row({ id: "edited", body: BODY.replace("Hello", "Hullo"), contentHash: contentHash("Hello", BODY, digest) }),
      row({ id: "err", subject: "#N/A" }),
      row({ id: "ex", to: "x@blocked.example" }),
      row({ id: "tokyo", recipientTimeZone: "Asia/Tokyo" }),
      row({ id: "ok" }),
      row({ id: "later", subject: "#REF!" }),
    ];
    const plan = planTick({ ...base, rows, exclusions: ["@blocked.example"] });
    expect(plan.skips).toEqual([
      { index: 0, reason: "content_changed" },
      { index: 1, reason: "sheets_error_value" },
      { index: 2, reason: "excluded" },
    ]);
    expect(plan.send).toBe(4);
    const waiting = planTick({ ...base, rows: [row()], nextSendAtMs: base.now.getTime() + MIN });
    expect(waiting).toMatchObject({ send: null, scheduled: 0, idle: "gap" });
  });

  it("holds non-allowlisted rows in dev mode", () => {
    const dev = parseSettings({ DEV_ALLOWLIST: "me@mine.example" });
    const plan = planTick({ ...base, settings: dev, rows: [row(), row({ id: "me", to: "me@mine.example" })] });
    expect(plan.skips).toEqual([{ index: 0, reason: "skipped: not in dev allowlist" }]);
    expect(plan.send).toBe(1);
  });
});

describe("parseSettings", () => {
  it("clamps hand-edited values", () => {
    const s = parseSettings({
      DAILY_SENDS: "100",
      GAP_MIN: "2",
      GAP_MAX: "",
      WINDOW_DAYS: "0, 6;3",
      WINDOW_START: " 08:00 ",
      WINDOW_END: "12:00",
      FALLBACK_TZ: " Europe/Oslo ",
    });
    expect(s.send).toEqual({
      dailySends: 40,
      gapRangeMinutes: [5, 6],
      sendWindow: { days: [3], start: "09:00", end: "12:00", fallbackTimeZone: "Europe/Oslo" },
    });
    expect(s.devMode).toBe(true);
  });
});
