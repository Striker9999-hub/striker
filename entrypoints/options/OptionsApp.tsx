import { type FormEvent, useEffect, useId, useState } from "react";
import {
  DEFAULT_WINDOW_END,
  DEFAULT_WINDOW_START,
  MAX_DAILY_SENDS,
  MIN_GAP_MINUTES,
  type SendSettings,
} from "@/shared/limits";
import {
  deleteAllLocalData,
  geminiKeyWarning,
  loadGeminiKey,
  loadSendSettings,
  saveGeminiKey,
  saveSendSettings,
} from "@/utils/settings";

const WEEKDAYS: readonly [number, string][] = [
  [1, "Mon"],
  [2, "Tue"],
  [3, "Wed"],
  [4, "Thu"],
  [5, "Fri"],
];

export function OptionsApp() {
  return (
    <main>
      <h1>Striker settings</h1>
      <p className="muted">Everything on this page is stored only in this browser.</p>
      <GeminiKeySection />
      <SendingSection />
      <DeleteSection />
    </main>
  );
}

function GeminiKeySection() {
  const id = useId();
  const [key, setKey] = useState("");
  const [show, setShow] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => {
    void loadGeminiKey().then(setKey);
  }, []);

  const warning = geminiKeyWarning(key);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    await saveGeminiKey(key);
    setStatus(key.trim() === "" ? "Key removed." : "Key saved.");
  }

  return (
    <section aria-labelledby={`${id}-h`}>
      <h2 id={`${id}-h`}>Gemini API key</h2>
      <p className="muted">
        Striker drafts emails with your own Gemini key. Version 1 supports the free tier only. Create a key in Google AI
        Studio. It is stored only in this browser and is never sent to the Striker developer.
      </p>
      <div className="notice" role="note">
        <strong>Free-tier privacy notice.</strong> On Gemini's free tier, Google may use what Striker sends (your
        resume details, contact names and roles, company research and drafts) to improve its products, and human
        reviewers may read it. Don't add anything you wouldn't want reviewed. Free-tier rate limits also apply, and
        drafting pauses when you hit them.
      </div>
      <form onSubmit={onSubmit}>
        <label htmlFor={`${id}-key`}>API key</label>
        <input
          id={`${id}-key`}
          type={show ? "text" : "password"}
          autoComplete="off"
          spellCheck={false}
          value={key}
          onChange={(e) => {
            setKey(e.target.value);
            setStatus("");
          }}
          aria-describedby={warning ? `${id}-warn` : undefined}
        />
        {warning && (
          <p id={`${id}-warn`} className="warning" role="status">
            {warning}
          </p>
        )}
        <button type="submit" className="primary">
          Save key
        </button>
        <button type="button" onClick={() => setShow((s) => !s)} aria-pressed={show}>
          {show ? "Hide key" : "Show key"}
        </button>
        {status && (
          <p className="status" role="status">
            {status}
          </p>
        )}
      </form>
    </section>
  );
}

interface SendForm {
  dailySends: string;
  gapMin: string;
  gapMax: string;
  days: number[];
  start: string;
  end: string;
  fallbackTimeZone: string;
}

function toForm(s: SendSettings): SendForm {
  return {
    dailySends: String(s.dailySends),
    gapMin: String(s.gapRangeMinutes[0]),
    gapMax: String(s.gapRangeMinutes[1]),
    days: [...s.sendWindow.days],
    start: s.sendWindow.start,
    end: s.sendWindow.end,
    fallbackTimeZone: s.sendWindow.fallbackTimeZone ?? "",
  };
}

function numberOrUndefined(v: string): number | undefined {
  if (v.trim() === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/** Describes every value the limits changed, so nothing is adjusted silently. */
function adjustments(form: SendForm, saved: SendSettings): string[] {
  const out: string[] = [];
  if (form.dailySends !== String(saved.dailySends)) out.push(`Daily limit set to ${saved.dailySends} (1–${MAX_DAILY_SENDS}).`);
  if (form.gapMin !== String(saved.gapRangeMinutes[0]) || form.gapMax !== String(saved.gapRangeMinutes[1])) {
    out.push(
      `Gap set to ${saved.gapRangeMinutes[0]}–${saved.gapRangeMinutes[1]} minutes (never under ${MIN_GAP_MINUTES}).`,
    );
  }
  if (form.days.length !== saved.sendWindow.days.length) out.push("At least one weekday is required; Mon–Fri restored.");
  if (form.start !== saved.sendWindow.start || form.end !== saved.sendWindow.end) {
    out.push(
      `Window set to ${saved.sendWindow.start}–${saved.sendWindow.end} (within ${DEFAULT_WINDOW_START}–${DEFAULT_WINDOW_END}, start before end).`,
    );
  }
  if (form.fallbackTimeZone.trim() !== (saved.sendWindow.fallbackTimeZone ?? "")) {
    out.push(`"${form.fallbackTimeZone.trim()}" isn't a recognised time zone; the Sheet's time zone will be used.`);
  }
  return out;
}

function SendingSection() {
  const id = useId();
  const [form, setForm] = useState<SendForm | null>(null);
  const [status, setStatus] = useState("");
  const [notes, setNotes] = useState<string[]>([]);

  useEffect(() => {
    void loadSendSettings().then((s) => setForm(toForm(s)));
  }, []);

  if (!form) return <section aria-busy="true">Loading…</section>;

  const set = (patch: Partial<SendForm>) => {
    setForm({ ...form, ...patch });
    setStatus("");
    setNotes([]);
  };

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    const saved = await saveSendSettings({
      dailySends: numberOrUndefined(form.dailySends),
      gapRangeMinutes: [numberOrUndefined(form.gapMin), numberOrUndefined(form.gapMax)],
      sendWindow: {
        days: form.days,
        start: form.start,
        end: form.end,
        fallbackTimeZone: form.fallbackTimeZone.trim() || null,
      },
    });
    setNotes(adjustments(form, saved));
    setForm(toForm(saved));
    setStatus("Sending settings saved.");
  }

  const toggleDay = (day: number) =>
    set({ days: form.days.includes(day) ? form.days.filter((d) => d !== day) : [...form.days, day].sort((a, b) => a - b) });

  return (
    <section aria-labelledby={`${id}-h`}>
      <h2 id={`${id}-h`}>Sending limits</h2>
      <p className="muted">
        These protect your Gmail account and can only be made stricter: at most {MAX_DAILY_SENDS} emails a day, a
        random gap of at least {MIN_GAP_MINUTES} minutes, weekdays between {DEFAULT_WINDOW_START} and{" "}
        {DEFAULT_WINDOW_END} in the recipient's time zone. If your Gmail account is new or rarely used, start lower.
      </p>
      <form onSubmit={onSubmit} noValidate>
        <div className="row">
          <div>
            <label htmlFor={`${id}-daily`}>Emails per day</label>
            <input
              id={`${id}-daily`}
              type="number"
              min={1}
              max={MAX_DAILY_SENDS}
              step={1}
              value={form.dailySends}
              onChange={(e) => set({ dailySends: e.target.value })}
            />
          </div>
          <div>
            <label htmlFor={`${id}-gmin`}>Gap from (minutes)</label>
            <input
              id={`${id}-gmin`}
              type="number"
              min={MIN_GAP_MINUTES}
              step={0.5}
              value={form.gapMin}
              onChange={(e) => set({ gapMin: e.target.value })}
            />
          </div>
          <div>
            <label htmlFor={`${id}-gmax`}>Gap to (minutes)</label>
            <input
              id={`${id}-gmax`}
              type="number"
              min={MIN_GAP_MINUTES}
              step={0.5}
              value={form.gapMax}
              onChange={(e) => set({ gapMax: e.target.value })}
            />
          </div>
        </div>
        <fieldset>
          <legend>Sending days</legend>
          {WEEKDAYS.map(([day, name]) => (
            <label key={day}>
              <input type="checkbox" checked={form.days.includes(day)} onChange={() => toggleDay(day)} />
              {name}
            </label>
          ))}
        </fieldset>
        <div className="row">
          <div>
            <label htmlFor={`${id}-start`}>Start</label>
            <input
              id={`${id}-start`}
              type="time"
              min={DEFAULT_WINDOW_START}
              max={DEFAULT_WINDOW_END}
              value={form.start}
              onChange={(e) => set({ start: e.target.value })}
            />
          </div>
          <div>
            <label htmlFor={`${id}-end`}>Stop</label>
            <input
              id={`${id}-end`}
              type="time"
              min={DEFAULT_WINDOW_START}
              max={DEFAULT_WINDOW_END}
              value={form.end}
              onChange={(e) => set({ end: e.target.value })}
            />
          </div>
          <div>
            <label htmlFor={`${id}-tz`}>Fallback time zone</label>
            <input
              id={`${id}-tz`}
              type="text"
              placeholder="e.g. Europe/London"
              value={form.fallbackTimeZone}
              onChange={(e) => set({ fallbackTimeZone: e.target.value })}
              aria-describedby={`${id}-tzhelp`}
            />
          </div>
        </div>
        <p id={`${id}-tzhelp`} className="muted">
          Used when a contact's time zone is unknown. Leave blank to use your Google Sheet's time zone.
        </p>
        <button type="submit" className="primary">
          Save sending settings
        </button>
        {status && (
          <div role="status">
            <p className="status">{status}</p>
            {notes.length > 0 && (
              <ul className="warning">
                {notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </form>
    </section>
  );
}

function DeleteSection() {
  const id = useId();
  const [confirming, setConfirming] = useState(false);
  const [status, setStatus] = useState("");

  async function onDelete() {
    await deleteAllLocalData();
    setConfirming(false);
    setStatus("All Striker data in this browser was deleted. Reload the page to start fresh.");
  }

  return (
    <section aria-labelledby={`${id}-h`}>
      <h2 id={`${id}-h`}>Delete all data</h2>
      <p className="muted">
        Removes your Gemini key, settings and anything else Striker stored in this browser. Your queue and send history
        live in your own Google Sheet: to remove them, delete that Sheet in Google Drive. Keep the Exclusions tab if you
        want opt-outs to stay honoured.
      </p>
      {!confirming ? (
        <button type="button" className="danger" onClick={() => setConfirming(true)}>
          Delete all data…
        </button>
      ) : (
        <div role="group" aria-label="Confirm deletion">
          <p>This can't be undone.</p>
          <button type="button" className="danger" onClick={() => void onDelete()}>
            Yes, delete everything
          </button>
          <button type="button" onClick={() => setConfirming(false)}>
            Cancel
          </button>
        </div>
      )}
      {status && (
        <p className="status" role="status">
          {status}
        </p>
      )}
    </section>
  );
}
