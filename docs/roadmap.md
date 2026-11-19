# Striker roadmap

Status labels: **done**, **in progress**, **planned**.

## M0 – Scaffold · done

WXT + React + TypeScript + Vitest extension with `storage` and `sidePanel`
permissions only. Shared modules: `limits.ts` (40/day max and default, random
5–6 minute gap, never under 5, Mon–Fri 09:00–17:00), `optout.ts`,
`textSafety.ts`. MIT licence, `.gitignore`, `CLAUDE.md`.

## M1 – Options page · done

Gemini API key (stored only in `chrome.storage.local`) with the free-tier
privacy notice and a soft "AIza" format check; daily limit, gap range and
sending window, all clamped to the fixed limits; delete-all.

## M2 – Apps Script sender · in progress

TypeScript sources in `apps-script/src`, bundled by `npm run build:gas`.
Sheet-backed queue and send log, 1-minute tick, random gap, daily cap,
recipient-time-zone window, dev-mode allowlist, content-hash integrity,
exclusions, error classification and protective pauses, stuck-send recovery,
bounce threshold, secret-protected web app
(`addToQueue`, `pause`, `resume`, `cancel`, `getStatus`, `addExclusion`).

The sources were rebuilt from the deployed bundle (`reference/Code.js`); an
equivalence test runs both bundles against a mocked Apps Script runtime.

**Live Google tests:** mostly passed. Remaining:

- [ ] Resume timing (next send waits a fresh 5–6 min gap after resume)
- [ ] Cancel (all pending, and per campaign)
- [ ] Exclusions (address and `@domain`; pending rows skipped)
- [ ] Interrupted sends: `found_in_sent` recovery
- [ ] Interrupted sends: `uncertain` (not found in Sent) held, never retried
- [ ] Bounces (3+ of the last 20 sends → auto-pause; resume acknowledges)

## Planned

- **M3 – Setup wizard (FR01):** copy Sheet + script, authorize, paste web-app
  URL and secret, send a test email to self. Push extension send settings to
  the Settings tab.
- **M4 – Inputs (FR03–FR08):** CSV import, column mapping and validation;
  in-browser resume extraction (PDF/DOCX) with confirmation; sample-email
  structure; preferences.
- **M5 – Research (FR09–FR15):** per-site permission requests, public-page
  reader, evidence storage with dates and confidence labels.
- **M6 – Drafting and review (FR16–FR19):** Gemini drafting with match
  explanation, flags for unsupported claims, batch approval.
- **M7 – Campaign controls and outcomes (FR21, FR25–FR27, NFR21):** side-panel
  progress, pause/resume/cancel, retries, outcome tracking, opt-outs to
  exclusions.
- **Deferred (v2):** reply detection and follow-ups (FR28).
