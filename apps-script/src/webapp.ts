import { STATUS_REASONS, type ApiAction, type ApiResponse, type SenderStatus } from "../../shared/types";
import { countSendsToday } from "./logic/cap";
import { isExcluded, normalizeExclusion } from "./logic/exclusions";
import { computeNextSendAt } from "./logic/gap";
import { buildQueueRows, countByStatus } from "./logic/queue";
import { type QueueRow, isPending } from "./logic/rows";
import { secretsMatch } from "./logic/secret";
import { parseSettings } from "./logic/settings";
import { sha256Hex } from "./digest";
import {
  appendExclusion,
  appendLog,
  appendQueueRows,
  readExclusions,
  readLog,
  readQueue,
  readSettings,
  userTimeZone,
  writeQueueRow,
} from "./sheet";
import * as state from "./state";

const ACTIONS: readonly ApiAction[] = ["addToQueue", "pause", "resume", "cancel", "getStatus", "addExclusion"];

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Handles a POST body: {secret, action, payload}. The web app is deployed
 * ANYONE_ANONYMOUS, so the secret check here is the only gate (NFR12).
 * Errors never echo request contents.
 */
export function handleRequest(body: string): ApiResponse {
  let request: unknown;
  try {
    request = JSON.parse(body);
  } catch {
    return { ok: false, error: "invalid_json" };
  }
  if (!isRecord(request) || !secretsMatch(request.secret, state.getSecret())) {
    return { ok: false, error: "unauthorized" };
  }
  const action = request.action as ApiAction;
  if (!ACTIONS.includes(action)) return { ok: false, error: "unknown_action" };

  if (action === "getStatus") {
    try {
      return { ok: true, data: getStatus(new Date()) };
    } catch {
      console.log("request failed: getStatus");
      return { ok: false, error: "internal_error" };
    }
  }

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10_000)) return { ok: false, error: "busy" };
  try {
    const now = new Date();
    switch (action) {
      case "addToQueue":
        return addToQueue(request.payload, now);
      case "pause":
        state.pause("user");
        return { ok: true, data: getStatus(now) };
      case "resume":
        return resume(now);
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

function addToQueue(payload: unknown, now: Date): ApiResponse {
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

/** FR22: resuming restarts the gap from now. */
function resume(now: Date): ApiResponse {
  const gap = parseSettings(readSettings()).send.gapRangeMinutes;
  state.resume(now.getTime(), computeNextSendAt(now.getTime(), gap));
  return { ok: true, data: getStatus(now) };
}

function skipPending(match: (row: QueueRow) => boolean, reason: string, now: Date): number {
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

/**
 * FR21: skips the pending rows of one campaign. A non-empty string
 * campaignId is required; anything else is rejected so a malformed request
 * can never cancel every campaign.
 */
function cancel(payload: unknown, now: Date): ApiResponse {
  const campaignId = isRecord(payload) ? payload.campaignId : undefined;
  if (typeof campaignId !== "string" || campaignId.trim() === "") return { ok: false, error: "invalid_campaign_id" };
  const cancelled = skipPending((r) => r.campaignId === campaignId, STATUS_REASONS.cancelled, now);
  return { ok: true, data: { cancelled } };
}

/** FR26/FR27: adds an address or @domain and skips matching pending rows. */
function addExclusion(payload: unknown, now: Date): ApiResponse {
  const value = normalizeExclusion(isRecord(payload) ? payload.value : undefined);
  if (value === null) return { ok: false, error: "invalid_exclusion" };
  if (!readExclusions().some((e) => normalizeExclusion(e) === value)) {
    appendExclusion(value, "extension", now.toISOString());
  }
  const skipped = skipPending((r) => isExcluded(r.to, [value]), STATUS_REASONS.excluded, now);
  return { ok: true, data: { value, skipped } };
}

export function getStatus(now: Date): SenderStatus {
  const settings = parseSettings(readSettings());
  const next = state.getNextSendAt();
  const paused = state.isPaused();
  return {
    counts: countByStatus(readQueue()),
    sentToday: countSendsToday(readLog(), now, userTimeZone()),
    dailyCap: settings.send.dailySends,
    paused,
    pauseReason: paused ? state.getPauseReason() : null,
    nextSendAt: next === null ? null : new Date(next).toISOString(),
    devMode: settings.devMode,
  };
}
