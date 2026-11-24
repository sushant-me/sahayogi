/**
 * Routing log — the evidence trail behind the Transparency panel.
 *
 * Kept as a tiny external store so the Ask page can append to it and the
 * Settings page can render it live, without threading state through both.
 * Persisted to localStorage so the panel survives a reload during a demo.
 */

import { getStorage, readString, writeJSON } from "../lib/storage";
import { useSyncExternalStore } from "react";

import type { InferenceMode, InferenceSource, RouteReason, TaskKind } from "../ai/policy";

export interface RoutingLogRow {
  id: string;
  at: number;
  taskKind: TaskKind;
  chars: number;
  predictedMode: InferenceMode;
  reason: RouteReason;
  actual: InferenceSource | null;
  latencyMs: number;
  degraded: boolean;
  agreed: boolean;
  device: string | null;
  /** Cloud model that answered, when the cloud was used. */
  model: string | null;
  /**
   * Set when the attempt failed. A failed attempt is still a routing decision, and hiding
   * it would make the ledger read "0 decisions" after a demo where nothing worked — the
   * least useful possible moment to say nothing happened.
   */
  error: string | null;
}

const STORAGE_KEY = "sahayogi.routingLog";
const MAX_ROWS = 40;

type Listener = () => void;

const listeners = new Set<Listener>();

/** Storage is browser-only; Node (tests, SSR) must never touch it. */
const hasBrowserStorage = () => getStorage() !== null;

function isRow(value: unknown): value is RoutingLogRow {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return typeof row.id === "string" && typeof row.reason === "string" && typeof row.at === "number";
}

function load(): RoutingLogRow[] {
  try {
    const raw = readString(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isRow).slice(0, MAX_ROWS);
  } catch {
    return [];
  }
}

let rows: RoutingLogRow[] = hasBrowserStorage() ? load() : [];

function persist(): void {
  if (!hasBrowserStorage()) return;
  try {
    writeJSON(STORAGE_KEY, rows);
  } catch {
    // Storage full or blocked: the in-memory log still works for this session.
  }
}

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): RoutingLogRow[] {
  return rows;
}

export interface LogRouteInput {
  taskKind: TaskKind;
  chars: number;
  predictedMode: InferenceMode;
  reason: RouteReason;
  actual: InferenceSource | null;
  latencyMs: number;
  degraded: boolean;
  device?: string | null;
  model?: string | null;
  error?: string | null;
}

export function logRoute(input: LogRouteInput): void {
  const predictedDevice = input.predictedMode === "prefer_on_device" || input.predictedMode === "only_on_device";
  const actuallyDevice = input.actual === "on_device";

  const row: RoutingLogRow = {
    id: `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    at: Date.now(),
    taskKind: input.taskKind,
    chars: input.chars,
    predictedMode: input.predictedMode,
    reason: input.reason,
    actual: input.actual,
    latencyMs: input.latencyMs,
    degraded: input.degraded,
    agreed: predictedDevice === actuallyDevice,
    device: input.device ?? null,
    model: input.model ?? null,
    error: input.error ?? null,
  };

  rows = [row, ...rows].slice(0, MAX_ROWS);
  persist();
  emit();
}

export function clearRoutingLog(): void {
  rows = [];
  persist();
  emit();
}

/** Snapshot for non-React callers (tests, the export path). */
export function readRoutingLog(): RoutingLogRow[] {
  return rows;
}

export function useRoutingLog(): RoutingLogRow[] {
  return useSyncExternalStore(subscribe, getSnapshot, () => rows);
}

/** Aggregate counts for the Settings header: how often reality matched prediction. */
export function summariseLog(log: RoutingLogRow[]): {
  total: number;
  onDevice: number;
  cloud: number;
  disagreements: number;
  failed: number;
  avgLatency: number | null;
} {
  const onDevice = log.filter((r) => r.actual === "on_device").length;
  const cloud = log.filter((r) => r.actual === "in_cloud").length;
  const withLatency = log.filter((r) => r.latencyMs > 0);
  return {
    total: log.length,
    onDevice,
    cloud,
    // A failure has no actual source, so it is not a disagreement — it is its own outcome.
    disagreements: log.filter((r) => !r.agreed && r.actual !== null).length,
    failed: log.filter((r) => r.error !== null).length,
    avgLatency:
      withLatency.length > 0
        ? Math.round(withLatency.reduce((sum, r) => sum + r.latencyMs, 0) / withLatency.length)
        : null,
  };
}

/**
 * Machine-readable export of the ledger.
 *
 * This is the artefact a judge can inspect after the video: every decision, the
 * mode it requested, the source the SDK reported, and whether they agreed.
 */
export function exportRoutingLogJSON(log: RoutingLogRow[]): string {
  const summary = summariseLog(log);
  return JSON.stringify(
    {
      app: "Sahayogi",
      ledger: "routing decisions recorded from Firebase AI Logic hybrid inference",
      exportedAt: new Date().toISOString(),
      schema: {
        predictedMode: "InferenceMode requested by the routing policy",
        actual: "InferenceSource reported by the SDK after the request",
        agreed: "predicted on-device state equals the reported source",
      },
      summary,
      rows: log,
    },
    null,
    2,
  );
}

export function downloadRoutingLog(log: RoutingLogRow[]): void {
  const blob = new Blob([exportRoutingLogJSON(log)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `sahayogi-routing-log-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
