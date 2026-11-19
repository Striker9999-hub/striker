/**
 * The rebuilt Apps Script bundle must behave exactly like the deployed one
 * (reference/Code.js) except for the intended fixes in INTENDED_FIXES.
 *
 * The comparison target is the reference with exactly those fixes applied
 * (each a find/replace that must match once). Both bundles run in identical
 * fake Apps Script runtimes and are driven through the same steps; every
 * return value and the full state (sheets, properties, sent mail, UI,
 * triggers, logs, Gmail queries) must match after every step. Any other
 * difference fails. A separate block runs the unpatched reference to show
 * each fix changes behaviour where intended.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { OPT_OUT_LINE } from "@/shared/optout";
import { buildGas } from "@/scripts/build-gas.mjs";
import { GasRuntime, type SendBehaviour, prng } from "./harness";

const REFERENCE_RAW = readFileSync(resolve(__dirname, "../../reference/Code.js"), "utf8");

/** M2.1 fixes: the only intended differences from the deployed bundle. */
const INTENDED_FIXES = [
  {
    name: "bounce regex: bob@x.com must not match bob@x.com.au",
    from: "($|[^a-z0-9-]|\\\\.(?![a-z0-9]))",
    to: "($|[^a-z0-9.-]|\\\\.(?![a-z0-9]))",
  },
  {
    name: "cancel: missing or non-string campaignId is rejected, never cancels everything",
    from: `    const campaignId = isRecord3(payload) && typeof payload.campaignId === "string" ? payload.campaignId : null;
    const cancelled = skipPending((r) => campaignId === null || r.campaignId === campaignId, STATUS_REASONS.cancelled, now);`,
    to: `    const campaignId = isRecord3(payload) ? payload.campaignId : void 0;
    if (typeof campaignId !== "string" || campaignId.trim() === "") return { ok: false, error: "invalid_campaign_id" };
    const cancelled = skipPending((r) => r.campaignId === campaignId, STATUS_REASONS.cancelled, now);`,
  },
] as const;

function applyFixes(code: string): string {
  return INTENDED_FIXES.reduce((out, fix) => {
    const count = out.split(fix.from).length - 1;
    if (count !== 1) throw new Error(`fix "${fix.name}" matched ${count} times in reference/Code.js`);
    return out.replace(fix.from, () => fix.to);
  }, code);
}

/** reference/Code.js + INTENDED_FIXES: what the rebuilt bundle must equal. */
const REFERENCE = applyFixes(REFERENCE_RAW);
let rebuilt = "";

beforeAll(async () => {
  rebuilt = await buildGas();
});

const MIN = 60_000;
const HOUR = 60 * MIN;
/** Monday 16 Nov 2026, 08:00 in New York (13:00 UTC). */
const MONDAY_8AM_NY = Date.UTC(2026, 10, 16, 13, 0);

interface TraceEntry {
  label: string;
  result: unknown;
  state: string;
}

type Recorder = (label: string, fn: () => unknown) => void;
type Scenario = (rt: GasRuntime, step: Recorder) => void;

function fingerprint(rt: GasRuntime): string {
  return createHash("sha256").update(JSON.stringify(rt.snapshot())).digest("hex");
}

function run(code: string, scenario: Scenario, seed = 1) {
  const rt = new GasRuntime(code, { startMs: MONDAY_8AM_NY, seed });
  const trace: TraceEntry[] = [];
  scenario(rt, (label, fn) => {
    const result = fn();
    trace.push({ label, result, state: fingerprint(rt) });
  });
  return { rt, trace, final: rt.snapshot() };
}

function expectEquivalent(scenario: Scenario, seed = 1) {
  const ref = run(REFERENCE, scenario, seed);
  const now = run(rebuilt, scenario, seed);
  expect(now.trace.length).toBe(ref.trace.length);
  for (let i = 0; i < ref.trace.length; i++) {
    if (JSON.stringify(now.trace[i]) !== JSON.stringify(ref.trace[i])) {
      // Show the first divergence with full detail.
      expect({ step: i, ...now.trace[i] }).toEqual({ step: i, ...ref.trace[i] });
    }
  }
  expect(now.final).toEqual(ref.final);
  return ref;
}

function body(name: string, extra = ""): string {
  return `Hi ${name},\n\nI enjoyed your team's engineering post.${extra}\n\n${OPT_OUT_LINE}\n\nBest,\nSam`;
}

function item(id: string, to: string, over: Record<string, unknown> = {}) {
  return { id, campaignId: "c1", to, subject: `Hello from Sam (${id})`, body: body(id), ...over };
}

function secretOf(rt: GasRuntime): string {
  return rt.props.get("SECRET") ?? "";
}

function api(rt: GasRuntime, action: string, payload?: unknown) {
  return rt.doPost({ secret: secretOf(rt), action, payload });
}

function ticks(rt: GasRuntime, step: Recorder, minutes: number, label = "tick") {
  for (let i = 0; i < minutes; i++) {
    rt.now += MIN;
    step(`${label} ${new Date(rt.now).toISOString()}`, () => rt.call("strikerTick"));
  }
}

/** Hand-written walk through every branch, roughly in the order a user meets them. */
const scripted: Scenario = (rt, step) => {
  step("exports", () => rt.eval("Object.keys(Striker).sort()"));
  step("limits", () => rt.eval("Striker.limits"));
  step("tick before setup", () => rt.call("strikerTick"));
  step("onOpen", () => rt.call("onOpen"));
  step("doPost with no event", () => rt.call("doPost"));
  step("unauthorized before a secret exists", () => rt.doPost({ secret: "", action: "getStatus" }));
  step("setup", () => rt.call("strikerSetup"));
  step("setup again keeps secret", () => rt.call("strikerSetup"));

  // Authentication and request validation.
  step("invalid json", () => rt.doPost("{nope"));
  step("json array", () => rt.doPost("[]"));
  step("missing secret", () => rt.doPost({ action: "getStatus" }));
  step("wrong secret", () => rt.doPost({ secret: "0".repeat(64), action: "getStatus" }));
  step("secret prefix", () => rt.doPost({ secret: secretOf(rt).slice(0, 63), action: "getStatus" }));
  step("secret plus suffix", () => rt.doPost({ secret: `${secretOf(rt)}0`, action: "getStatus" }));
  step("secret as number", () => rt.doPost({ secret: 42, action: "getStatus" }));
  step("unknown action", () => api(rt, "deleteEverything"));
  step("getStatus", () => api(rt, "getStatus"));

  // addToQueue validation.
  for (const [label, payload] of [
    ["payload missing", undefined],
    ["payload array", []],
    ["bad batch id", { batchId: "", approvedAt: "2026-11-16T12:00:00Z", items: [item("a", "a@x.com")] }],
    ["not approved", { batchId: "b0", approvedAt: "yesterday-ish", items: [item("a", "a@x.com")] }],
    ["no items", { batchId: "b0", approvedAt: "2026-11-16T12:00:00Z", items: [] }],
    ["too many items", { batchId: "b0", approvedAt: "2026-11-16T12:00:00Z", items: Array.from({ length: 201 }, (_, i) => item(`t${i}`, `t${i}@x.com`)) }],
  ] as const) {
    step(`addToQueue: ${label}`, () => api(rt, "addToQueue", payload));
  }

  step("exclude a domain before queueing", () => api(rt, "addExclusion", { value: " @Blocked.example " }));
  step("exclude same domain again", () => api(rt, "addExclusion", { value: "@blocked.example" }));
  step("invalid exclusion", () => api(rt, "addExclusion", { value: "not an address" }));
  step("exclusion without payload", () => api(rt, "addExclusion"));

  const approvedAt = new Date(rt.now - HOUR).toISOString();
  step("addToQueue: mixed batch", () =>
    api(rt, "addToQueue", {
      batchId: " b1 ",
      approvedAt,
      items: [
        item("ana", "Ana@Acme.example", { recipientTimeZone: "Europe/London" }),
        item("ben", "ben@acme.example"),
        item("cat", "cat@beta.example", { recipientTimeZone: "Asia/Tokyo" }),
        item("dan", "dan@beta.example", { recipientTimeZone: "Not/AZone" }),
        item("eve", "eve@blocked.example"),
        item("ana", "dup@acme.example"),
        item("fay", "fay@gamma.example", { campaignId: "c2" }),
        item("gus", "gus@gamma.example", { campaignId: "c2" }),
        item("hal", "hal@delta.example"),
        item("ivy", "ivy@delta.example"),
        item("jon", "jon@epsilon.example"),
        item("kim", "kim@epsilon.example"),
        item("lee", "lee@zeta.example"),
        item("max", "max@zeta.example"),
        "not an object",
        { id: "x\ny", campaignId: "c1" },
        item("bad-campaign", "a@x.com", { campaignId: "" }),
        item("bad-to", "not-an-email"),
        item("bad-subject", "a@x.com", { subject: "two\nlines" }),
        item("empty-subject", "a@x.com", { subject: "  " }),
        item("long-subject", "a@x.com", { subject: "s".repeat(201) }),
        item("empty-body", "a@x.com", { body: " \n " }),
        item("long-body", "a@x.com", { body: body("x", "y".repeat(20_000)) }),
        item("err-subject", "a@x.com", { subject: "#REF!" }),
        item("unsafe-subject", "a@x.com", { subject: "=HYPERLINK(1)" }),
        item("unsafe-body", "a@x.com", { body: body("x", "\n@everyone") }),
        item("dash-body", "a@x.com", { body: `- hi\n${OPT_OUT_LINE}` }),
        item("no-optout", "a@x.com", { body: "Hi,\nNo opt out here." }),
        item("formula-ish-ok", "plus@x.com", { body: `Hi,\n- bullet one\n\t- nested\n${OPT_OUT_LINE}` }),
      ],
    }),
  );
  step("addToQueue: same ids again are duplicates", () =>
    api(rt, "addToQueue", { batchId: "b1", approvedAt, items: [item("ana", "ana@acme.example"), item("ben", "ben@acme.example")] }),
  );

  // DEV_MODE is on by default: nobody is on the allowlist yet.
  step("allowlist ana and ben", () => rt.setSetting("DEV_ALLOWLIST", "ana@acme.example, BEN@acme.example;junk"));
  ticks(rt, step, 30, "before window"); // 08:01–08:30 New York
  rt.now = Date.UTC(2026, 10, 16, 14, 0) - MIN; // 08:59 NY, 14:00 London
  ticks(rt, step, 20, "window opens");
  step("status mid-morning", () => api(rt, "getStatus"));
  step("show status", () => rt.call("strikerShowStatus"));

  // Real sending.
  step("dev mode off", () => rt.setSetting("DEV_MODE", " false "));
  step("daily cap 6.9 floors to 6", () => rt.setSetting("DAILY_SENDS", "6.9"));
  step("gap 7–9 minutes", () => {
    rt.setSetting("GAP_MIN", "9");
    rt.setSetting("GAP_MAX", "7");
  });
  step("re-add skipped rows under new ids", () =>
    api(rt, "addToQueue", {
      batchId: "b2",
      approvedAt: new Date(rt.now).toISOString(),
      items: ["ana2", "ben2", "cat2", "dan2", "hal2", "ivy2"].map((id) => item(id, `${id}@retry.example`)),
    }),
  );
  ticks(rt, step, 90, "sending");

  // Pause and resume restart the gap.
  step("pause", () => api(rt, "pause"));
  ticks(rt, step, 15, "paused");
  step("show status paused", () => rt.call("strikerShowStatus"));
  step("resume", () => api(rt, "resume"));
  ticks(rt, step, 15, "resumed");

  // Next day: errors of every class.
  rt.now = Date.UTC(2026, 10, 17, 14, 0);
  step("cap back to 40, gap 5–5", () => {
    rt.setSetting("DAILY_SENDS", "400");
    rt.setSetting("GAP_MIN", "1");
    rt.setSetting("GAP_MAX", "");
  });
  step("queue error batch", () =>
    api(rt, "addToQueue", {
      batchId: "b3",
      approvedAt: new Date(rt.now).toISOString(),
      items: ["tmp", "inv", "unk", "quo", "aut", "lost", "ok1", "ok2"].map((id) => item(id, `${id}@errors.example`, { campaignId: "c3" })),
    }),
  );
  const behaviours: SendBehaviour[] = [
    { kind: "throw", message: "Service unavailable: try again later" },
    { kind: "throw", message: "Backend Error" },
    { kind: "throw", message: "Request timed out" },
    { kind: "throw", message: "Invalid email: inv@errors.example" },
    { kind: "throw", message: "Something odd happened" },
    { kind: "throw", message: "Service invoked too many times for one day: email." },
  ];
  rt.sendBehaviours.push(...behaviours);
  ticks(rt, step, 40, "errors");
  step("show status quota", () => rt.call("strikerShowStatus"));
  step("resume after quota", () => api(rt, "resume"));
  rt.sendBehaviours.push({ kind: "throw", message: "Authorization is required to perform that action." });
  ticks(rt, step, 12, "auth");
  step("show status auth", () => rt.call("strikerShowStatus"));
  step("resume after auth", () => api(rt, "resume"));
  rt.sendBehaviours.push({ kind: "deliverThenThrow", message: "Service unavailable" });
  ticks(rt, step, 20, "delivered but threw");

  // Interrupted executions: rows left in "sending".
  step("queue stuck rows", () =>
    api(rt, "addToQueue", {
      batchId: "b4",
      approvedAt: new Date(rt.now).toISOString(),
      items: [item("stuck-sent", "s1@stuck.example"), item("stuck-lost", "s2@stuck.example"), item("stuck-fresh", "s3@stuck.example"), item("stuck-nodate", "s4@stuck.example")],
    }),
  );
  step("simulate interrupted sends", () => {
    const rows = rt.queueRows();
    const idx = (id: string) => rows.findIndex((r) => r.id === id);
    for (const id of ["stuck-sent", "stuck-lost"]) {
      rt.setQueueCell(idx(id), "status", "sending");
      rt.setQueueCell(idx(id), "updatedAt", new Date(rt.now - 11 * MIN).toISOString());
    }
    rt.setQueueCell(idx("stuck-fresh"), "status", "sending");
    rt.setQueueCell(idx("stuck-fresh"), "updatedAt", new Date(rt.now - 2 * MIN).toISOString());
    rt.setQueueCell(idx("stuck-nodate"), "status", "sending");
    rt.setQueueCell(idx("stuck-nodate"), "updatedAt", "garbage");
    const row = rows[idx("stuck-sent")]!;
    rt.addSent(row.to, row.subject, rt.now - 10 * MIN);
  });
  ticks(rt, step, 12, "recover");

  // Hand edits in the Sheet.
  step("queue edit batch", () =>
    api(rt, "addToQueue", {
      batchId: "b5",
      approvedAt: new Date(rt.now).toISOString(),
      items: [item("edited", "e1@edit.example"), item("ref", "e2@edit.example"), item("nohash", "e3@edit.example"), item("weird", "e4@edit.example")],
    }),
  );
  step("edit cells", () => {
    const rows = rt.queueRows();
    const idx = (id: string) => rows.findIndex((r) => r.id === id);
    rt.setQueueCell(idx("edited"), "body", rows[idx("edited")]!.body.replace("enjoyed", "loved"));
    rt.setQueueCell(idx("ref"), "subject", "#REF!");
    rt.setQueueCell(idx("nohash"), "contentHash", "");
    rt.setQueueCell(idx("weird"), "status", "Queued"); // not a known status
  });
  ticks(rt, step, 20, "edits");

  // Cancel and exclusions.
  step("queue cancel batch", () =>
    api(rt, "addToQueue", {
      batchId: "b6",
      approvedAt: new Date(rt.now).toISOString(),
      items: [
        item("k1", "k1@cancel.example", { campaignId: "keep" }),
        item("k2", "k2@cancel.example", { campaignId: "drop" }),
        item("k3", "k3@cancel.example", { campaignId: "drop" }),
        item("k4", "k4@other.example", { campaignId: "keep" }),
        item("k5", "k5@other.example", { campaignId: "keep" }),
      ],
    }),
  );
  ticks(rt, step, 1, "schedule one");
  step("cancel one campaign", () => api(rt, "cancel", { campaignId: "drop" }));
  step("cancel unknown campaign", () => api(rt, "cancel", { campaignId: "nope" }));
  step("exclude an address", () => api(rt, "addExclusion", { value: "K4@Other.example" }));
  step("exclude by hand in the sheet", () => {
    const s = rt.sheet("Exclusions")!;
    s.data.push(["@other.example", "", "manual"], ["", "", ""], ["garbage", "", ""]);
  });
  ticks(rt, step, 2, "after exclusions");
  // M2.1: a missing, blank or non-string campaignId is rejected (it used to cancel everything).
  for (const [label, payload] of [
    ["missing payload", undefined],
    ["no campaignId", {}],
    ["numeric", { campaignId: 7 }],
    ["blank", { campaignId: "  " }],
  ] as const) {
    step(`cancel rejected: ${label}`, () => api(rt, "cancel", payload));
  }
  step("cancel the remaining campaign", () => api(rt, "cancel", { campaignId: "keep" }));

  // Bounces: 3 of the last 20 sent recipients.
  step("queue bounce batch", () =>
    api(rt, "addToQueue", {
      batchId: "b7",
      approvedAt: new Date(rt.now).toISOString(),
      items: ["b1", "b2", "b3", "b4", "b5", "b6"].map((id) => item(id, `${id}@bounce.example`)),
    }),
  );
  ticks(rt, step, 25, "bounce sends");
  step("bounces arrive", () => {
    const sent = rt.queueRows().filter((r) => r.status === "sent").slice(-3);
    rt.addBounce(`Address not found\n\nYour message wasn't delivered to ${sent[0]!.to} because the address couldn't be found.`);
    rt.addBounce(`<${sent[1]!.to}>: host said: 550 no such user`);
    rt.addBounce(`Delivery failed: x${sent[2]!.to} (not a real match)`, "postmaster@example.com");
    rt.addBounce(`${sent[2]!.to}.`, "Someone <friend@example.com>");
    rt.addBounce(`Failed: list+${sent[2]!.to} (a different address)`, "postmaster@example.com");
    rt.addBounce(`550 ${sent[2]!.to}.au: no such domain (a different address)`, "postmaster@example.com");
  });
  ticks(rt, step, 8, "two bounces");
  step("third bounce", () => {
    const sent = rt.queueRows().filter((r) => r.status === "sent").slice(-1);
    rt.addBounce(`Recipient ${sent[0]!.to.toUpperCase()} rejected.`, "postmaster@example.com");
  });
  ticks(rt, step, 8, "three bounces");
  step("show status bounces", () => rt.call("strikerShowStatus"));
  step("resume acknowledges bounces", () => api(rt, "resume"));
  ticks(rt, step, 15, "after ack");

  // Busy lock, broken sheets, settings repair, menu actions.
  rt.lockAvailable = false;
  step("busy addToQueue", () => api(rt, "addToQueue", { batchId: "bz", approvedAt, items: [item("z", "z@x.com")] }));
  step("busy tick", () => {
    rt.now += MIN;
    return rt.call("strikerTick");
  });
  step("getStatus ignores the lock", () => api(rt, "getStatus"));
  rt.lockAvailable = true;
  step("delete Exclusions tab and a setting", () => {
    rt.sheets.delete("Exclusions");
    const s = rt.sheet("Settings")!;
    s.data = s.data.filter((r) => r[0] !== "WINDOW_END");
    s.data.push(["DAILY_SENDS", "1", "duplicate key, ignored"]);
  });
  step("addExclusion recreates the tab", () => api(rt, "addExclusion", { value: "@later.example" }));
  step("setup repairs settings", () => rt.call("strikerSetup"));
  step("narrow window and fallback tz", () => {
    rt.setSetting("WINDOW_DAYS", "2;4, 6 x");
    rt.setSetting("WINDOW_START", "10:00");
    rt.setSetting("WINDOW_END", "11:00");
    rt.setSetting("FALLBACK_TZ", "Australia/Sydney");
  });
  step("queue window batch", () =>
    api(rt, "addToQueue", {
      batchId: "b8",
      approvedAt: new Date(rt.now).toISOString(),
      items: [item("w1", "w1@window.example"), item("w2", "w2@window.example", { recipientTimeZone: "America/Los_Angeles" })],
    }),
  );
  rt.now = Date.UTC(2026, 10, 18, 22, 50); // Wed 17:50 NY = Thu 09:50 Sydney
  ticks(rt, step, 90, "window edge");
  rt.alertAnswer = "CANCEL";
  step("new secret cancelled", () => rt.call("strikerNewSecret"));
  rt.alertAnswer = "OK";
  step("new secret", () => rt.call("strikerNewSecret"));
  step("old secret rejected", () => rt.doPost({ secret: "0".repeat(64), action: "getStatus" }));
  step("new secret accepted", () => api(rt, "getStatus"));
  step("short stored secret rejects everything", () => {
    rt.props.set("SECRET", "abc");
    return rt.doPost({ secret: "abc", action: "getStatus" });
  });
  step("garbage properties", () => {
    rt.props.set("SECRET", secretOf(rt) || "f".repeat(64));
    rt.props.set("SECRET", "f".repeat(64));
    rt.props.set("NEXT_SEND_AT", "soon");
    rt.props.set("PAUSED", "true");
    rt.props.set("PAUSE_REASON", "aliens");
    return api(rt, "getStatus");
  });
  step("show status unknown reason", () => rt.call("strikerShowStatus"));
};

/** Seeded random walk: many interleavings the script above doesn't think of. */
function randomWalk(steps: number): Scenario {
  return (rt, step) => {
    const r = prng(rt.random() * 2 ** 32);
    const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]!;
    const domains = ["a.example", "b.example", "c.example", "bounce.example"];
    let n = 0;
    step("setup", () => rt.call("strikerSetup"));
    step("dev off", () => rt.setSetting("DEV_MODE", "FALSE"));
    for (let i = 0; i < steps; i++) {
      // Users resume sooner or later; without this the walk idles once paused.
      if (rt.props.get("PAUSED") === "true" && r() < 0.05) step(`auto-resume ${i}`, () => api(rt, "resume"));
      const x = r();
      if (x < 0.55) {
        rt.now += MIN * (1 + Math.floor(r() * 3));
        step(`tick ${i}`, () => rt.call("strikerTick"));
      } else if (x < 0.6) {
        rt.now += HOUR * (1 + Math.floor(r() * 20));
        step(`jump ${i}`, () => rt.call("strikerTick"));
      } else if (x < 0.7) {
        const count = 1 + Math.floor(r() * 6);
        const items = Array.from({ length: count }, () => {
          const id = r() < 0.1 && n > 0 ? `r${Math.floor(r() * n)}` : `r${n++}`;
          const to = r() < 0.05 ? "broken" : `${id}@${pick(domains)}`;
          const tz = pick([undefined, "Europe/Berlin", "Asia/Kolkata", "Pacific/Auckland", "bogus"]);
          return item(id, to, { campaignId: pick(["c1", "c2", "c3"]), recipientTimeZone: tz });
        });
        step(`add ${i}`, () => api(rt, "addToQueue", { batchId: `rb${i}`, approvedAt: new Date(rt.now).toISOString(), items }));
      } else if (x < 0.73) {
        step(`pause ${i}`, () => api(rt, "pause"));
      } else if (x < 0.78) {
        step(`resume ${i}`, () => api(rt, "resume"));
      } else if (x < 0.8) {
        step(`cancel ${i}`, () => api(rt, "cancel", r() < 0.5 ? { campaignId: pick(["c1", "c2", "c3"]) } : undefined));
      } else if (x < 0.82) {
        step(`exclude ${i}`, () => api(rt, "addExclusion", { value: r() < 0.5 ? `@${pick(domains)}` : `r${Math.floor(r() * (n + 1))}@${pick(domains)}` }));
      } else if (x < 0.87) {
        const b: SendBehaviour = pick([
          { kind: "throw", message: "Service unavailable" },
          { kind: "throw", message: "Invalid argument: recipient" },
          { kind: "throw", message: "Limit Exceeded: Email Recipients Per Message" },
          { kind: "throw", message: "Access denied" },
          { kind: "throw", message: "kaboom" },
          { kind: "deliverThenThrow", message: "Timed out" },
        ]);
        step(`gmail will fail ${i}`, () => void (rt.sendBehaviours.length < 2 && rt.sendBehaviours.push(b)));
      } else if (x < 0.9) {
        step(`bounce ${i}`, () => {
          const sent = rt.queueRows().filter((q) => q.status === "sent");
          if (sent.length) rt.addBounce(`Undeliverable: ${pick(sent).to}`);
        });
      } else if (x < 0.92) {
        step(`interrupt ${i}`, () => {
          const rows = rt.queueRows();
          const k = rows.findIndex((q) => q.status === "queued" || q.status === "scheduled");
          if (k < 0) return;
          rt.setQueueCell(k, "status", "sending");
          rt.setQueueCell(k, "updatedAt", new Date(rt.now - Math.floor(r() * 20) * MIN).toISOString());
          if (r() < 0.5) rt.addSent(rows[k]!.to, rows[k]!.subject, rt.now - 5 * MIN);
        });
      } else if (x < 0.94) {
        step(`edit ${i}`, () => {
          const rows = rt.queueRows();
          if (!rows.length) return;
          const k = Math.floor(r() * rows.length);
          rt.setQueueCell(k, pick(["subject", "body", "status", "to", "recipientTimeZone"]), pick(["#N/A", "queued", "changed", "x@a.example", ""]));
        });
      } else if (x < 0.97) {
        step(`settings ${i}`, () =>
          rt.setSetting(
            pick(["DAILY_SENDS", "GAP_MIN", "GAP_MAX", "WINDOW_DAYS", "WINDOW_START", "WINDOW_END", "FALLBACK_TZ"]),
            pick(["", "3", "50", "0.5", "8", "1,3,5", "08:00", "12:30", "18:00", "Europe/Paris", "TRUE", "nonsense"]),
          ),
        );
      } else if (x < 0.975) {
        // Rare: dev mode back on (blank/typo also means on), then off again later.
        step(`dev mode ${i}`, () => rt.setSetting("DEV_MODE", pick(["TRUE", "", "fasle", "FALSE", "false"])));
      } else {
        rt.lockAvailable = r() < 0.5;
        step(`lock ${rt.lockAvailable} ${i}`, () => api(rt, "getStatus"));
      }
    }
    rt.lockAvailable = true;
    step("final status", () => api(rt, "getStatus"));
  };
}

describe("rebuilt Apps Script bundle", () => {
  it("is built from apps-script/src and exposes the same globals", () => {
    expect(rebuilt).toContain('var Striker = (() => {');
    for (const fn of ["doPost", "onOpen", "strikerTick", "strikerSetup", "strikerShowStatus", "strikerNewSecret"]) {
      expect(rebuilt).toContain(`function ${fn}(e) { return Striker.${fn}(e); }`);
    }
  });

  it("applies each intended fix exactly once", () => {
    expect(REFERENCE).not.toBe(REFERENCE_RAW);
    for (const fix of INTENDED_FIXES) expect(REFERENCE).toContain(fix.to);
  });

  it("matches reference/Code.js on the scripted scenario", { timeout: 60_000 }, () => {
    const ref = expectEquivalent(scripted);
    // Guard against a vacuous comparison: the scenario must reach every branch.
    const log = ref.final.sheets.SendLog!.slice(1);
    const codes = new Set(log.map((r) => `${r[3]}:${r[4]}`));
    for (const c of [
      "sent:",
      "sent:found_in_sent",
      "uncertain:stuck_sending",
      "uncertain:unknown",
      "failed:invalid_recipient",
      "failed:temporary",
      "queued:temporary",
      "queued:quota",
      "queued:auth",
      "skipped:excluded",
      "skipped:cancelled",
      "skipped:content_changed",
      "skipped:sheets_error_value",
      "skipped:skipped: not in dev allowlist",
    ]) {
      expect(codes, c).toContain(c);
    }
    expect(ref.final.logs).toContain("auto-paused: bounces=3");
    expect(ref.final.sent.length).toBeGreaterThan(20);
    const alerts = JSON.stringify(ref.final.alerts);
    for (const s of ["Paused by you.", "sending limit", "authorization was revoked", "bounced", "Striker setup secret"]) {
      expect(alerts).toContain(s);
    }
  });

  it.each([1, 2, 3, 4, 5])("matches reference/Code.js on random walk (seed %i)", { timeout: 60_000 }, (seed) => {
    const ref = expectEquivalent(randomWalk(1500), seed);
    const codes = new Set(ref.final.sheets.SendLog!.slice(1).map((r) => `${r[3]}:${r[4]}`));
    // Non-vacuous: the walk sends mail and reaches many different outcomes.
    expect(ref.final.sent.length).toBeGreaterThan(2);
    expect(codes.size).toBeGreaterThanOrEqual(8);
  });

  it("is byte-identical to reference/Code.js + intended fixes with the pinned esbuild", () => {
    // Not required for correctness (the behavioural tests above are); this
    // flags any unintended source drift. After an esbuild upgrade that only
    // changes formatting, rely on the behavioural tests and update the pin.
    expect(createHash("sha256").update(rebuilt).digest("hex")).toBe(
      createHash("sha256").update(REFERENCE).digest("hex"),
    );
  });
});

describe("intended differences from the deployed bundle (M2.1)", () => {
  const approvedAt = new Date(MONDAY_8AM_NY).toISOString();

  function ready(code: string): GasRuntime {
    const rt = new GasRuntime(code, { startMs: Date.UTC(2026, 10, 16, 15, 0), seed: 7 }); // Mon 10:00 NY
    rt.call("strikerSetup");
    rt.setSetting("DEV_MODE", "FALSE");
    return rt;
  }

  function queue(rt: GasRuntime, items: ReturnType<typeof item>[]) {
    expect(api(rt, "addToQueue", { batchId: "b", approvedAt, items })).toMatchObject({ response: { ok: true } });
  }

  function statuses(rt: GasRuntime): string[] {
    return rt.queueRows().map((r) => `${r.id}:${r.status}`);
  }

  describe("cancel", () => {
    const items = [
      item("a1", "a1@x.example", { campaignId: "A" }),
      item("a2", "a2@x.example", { campaignId: "A" }),
      item("b1", "b1@x.example", { campaignId: "B" }),
    ];

    it.each([
      ["missing payload", undefined],
      ["payload without campaignId", {}],
      ["numeric campaignId", { campaignId: 7 }],
      ["null campaignId", { campaignId: null }],
      ["array campaignId", { campaignId: ["A"] }],
      ["empty campaignId", { campaignId: "" }],
      ["blank campaignId", { campaignId: "   " }],
      ["payload is an array", [{ campaignId: "A" }]],
    ])("rejects %s and changes nothing", (_label, payload) => {
      const rt = ready(rebuilt);
      queue(rt, items);
      const before = rt.snapshot();
      expect(api(rt, "cancel", payload)).toEqual({
        mime: "JSON",
        response: { ok: false, error: "invalid_campaign_id" },
      });
      expect(rt.snapshot().sheets).toEqual(before.sheets);
    });

    it("cancels only the named campaign", () => {
      const rt = ready(rebuilt);
      queue(rt, items);
      expect(api(rt, "cancel", { campaignId: "A" })).toMatchObject({ response: { ok: true, data: { cancelled: 2 } } });
      expect(statuses(rt)).toEqual(["a1:skipped", "a2:skipped", "b1:queued"]);
    });

    it("used to cancel every campaign in the deployed bundle", () => {
      const rt = ready(REFERENCE_RAW);
      queue(rt, items);
      expect(api(rt, "cancel", { campaignId: 7 })).toMatchObject({ response: { ok: true, data: { cancelled: 3 } } });
      expect(statuses(rt)).toEqual(["a1:skipped", "a2:skipped", "b1:skipped"]);
    });
  });

  describe("bounce matching", () => {
    /** Sends 3 emails, adds bounces from `text(to)`, then returns what the 4th tick does. */
    function bounceRun(code: string, text: (to: string) => string) {
      const rt = ready(code);
      queue(rt, ["r1", "r2", "r3", "r4"].map((id) => item(id, `${id}@bounce.example`)));
      for (let i = 0; i < 25 && rt.sent.length < 3; i++) {
        rt.now += MIN;
        rt.call("strikerTick");
      }
      expect(rt.sent.map((m) => m.to)).toEqual(["r1@bounce.example", "r2@bounce.example", "r3@bounce.example"]);
      for (const m of rt.sent) rt.addBounce(text(m.to));
      for (let i = 0; i < 10; i++) {
        rt.now += MIN;
        rt.call("strikerTick");
      }
      return { paused: rt.props.get("PAUSE_REASON") ?? "", sent: rt.sent.length };
    }

    const suffixed = (to: string) => `Delivery to ${to}.au failed: domain not found`;

    it("ignores an address that only appears with a longer domain", () => {
      expect(bounceRun(rebuilt, suffixed)).toEqual({ paused: "", sent: 4 });
    });

    it("still pauses on real bounces, including <addr> and a trailing full stop", () => {
      expect(bounceRun(rebuilt, (to) => `Your message to <${to}> wasn't delivered.`)).toEqual({ paused: "bounces", sent: 3 });
      expect(bounceRun(rebuilt, (to) => `Address not found: ${to}.`)).toEqual({ paused: "bounces", sent: 3 });
    });

    it("used to count bob@x.com.au as bob@x.com in the deployed bundle", () => {
      expect(bounceRun(REFERENCE_RAW, suffixed)).toEqual({ paused: "bounces", sent: 3 });
    });
  });
});
