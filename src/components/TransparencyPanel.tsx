/**
 * Transparency — "how routing works".
 *
 * This is a product surface, not a debug console: it is the page that answers
 * "was that really on-device?" with rows the app actually recorded. Each row
 * carries the decision the policy made, the source the SDK reported, and whether
 * the two agreed.
 */

import type { RouteReason } from "../ai/policy";
import { summariseLog, useRoutingLog, type RoutingLogRow } from "../state/routingLog";
import { Chip, EmptyState, SectionHeading, Stat } from "./ui";

const REASON_COPY: Record<RouteReason, string> = {
  "forced-device": "pinned to device",
  "forced-cloud": "pinned to cloud",
  "kill-switch": "disabled by remote config",
  "device-unavailable": "no device model",
  "device-not-ready": "model not downloaded",
  "unsupported-language": "language not on-device",
  "heavy-task": "heavy task",
  "long-prompt": "over length threshold",
  "offline-degraded": "offline, reduced quality",
  "light-task": "within threshold",
};

const MODE_COPY: Record<string, string> = {
  prefer_on_device: "prefer device",
  only_on_device: "device only",
  only_in_cloud: "cloud only",
  prefer_in_cloud: "prefer cloud",
};

function timeAgo(ms: number): string {
  const seconds = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.round(minutes / 60)}h ago`;
}

function Row({ row }: { row: RoutingLogRow }) {
  const actualLabel =
    row.actual === "on_device" ? "on-device" : row.actual === "in_cloud" ? "cloud" : "unknown";
  const actualTone = row.actual === "on_device" ? "device" : "cloud";

  return (
    <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3 border-b border-line/60 px-3 py-2.5 last:border-b-0 sm:grid-cols-[70px_1fr_auto_auto_auto]">
      <span className="hidden text-[11.5px] tabular-nums text-muted sm:block">{timeAgo(row.at)}</span>

      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[12.5px] text-ink">{MODE_COPY[row.predictedMode] ?? row.predictedMode}</span>
          <span className="text-muted" aria-hidden="true">
            →
          </span>
          <Chip tone={actualTone}>{actualLabel}</Chip>
          {!row.agreed ? <Chip tone="warn">prediction missed</Chip> : null}
          {row.degraded ? <Chip tone="warn">reduced quality</Chip> : null}
        </div>
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11.5px] text-muted">
          <span>{REASON_COPY[row.reason] ?? row.reason}</span>
          <span>{row.chars} chars</span>
          <span>{row.taskKind}</span>
          <span className="sm:hidden">{timeAgo(row.at)}</span>
        </div>
      </div>

      <span className="hidden text-[11.5px] tabular-nums text-muted sm:block">
        {row.latencyMs > 0 ? `${row.latencyMs} ms` : "—"}
      </span>
      <span className="hidden text-[11px] text-muted sm:block">{row.device ?? ""}</span>
      <span className="text-[11.5px] tabular-nums text-muted sm:hidden">{row.latencyMs} ms</span>
    </div>
  );
}

export function TransparencyPanel() {
  const log = useRoutingLog();
  const summary = summariseLog(log);

  return (
    <section className="panel p-5">
      <SectionHeading
        title="Transparency — how routing works"
        hint="Every prompt is a decision. This is the decision this app made, and the source the Firebase AI Logic SDK reported afterwards. Prediction and reality are recorded separately, so a fallback is visible rather than hidden."
      />

      {log.length === 0 ? (
        <EmptyState
          title="No routing decisions yet"
          body="Ask a question on the Ask page. Each answer appends a row here showing what the router predicted and what the SDK actually did."
        />
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Decisions" value={summary.total} />
            <Stat label="On-device" value={summary.onDevice} tone="text-device" />
            <Stat label="Cloud" value={summary.cloud} tone="text-cloud" />
            <Stat
              label="Prediction missed"
              value={summary.disagreements}
              tone={summary.disagreements > 0 ? "text-warn" : undefined}
            />
          </div>
          <div className="overflow-hidden rounded-lg border border-line bg-panel-2/50">
            {log.map((row) => (
              <Row key={row.id} row={row} />
            ))}
          </div>
          <p className="mt-3 text-[11.5px] leading-relaxed text-muted">
            {summary.avgLatency !== null ? `Average latency ${summary.avgLatency} ms. ` : ""}
            A "prediction missed" row means the policy asked for the device and the SDK used the cloud (or the reverse).
            Both are correct behaviour; the disagreement is the interesting part.
          </p>
        </>
      )}
    </section>
  );
}
