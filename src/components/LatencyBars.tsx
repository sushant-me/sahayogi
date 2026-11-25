/**
 * Latency comparison: on-device versus cloud, as two bars.
 *
 * The app already records `latencyMs` per decision, so this is not decoration — it is the
 * project's argument rendered as a picture. A device answer that arrives in 400 ms next to a
 * cloud answer at 4,900 ms says more about why hybrid inference matters than a paragraph does.
 *
 * Pure CSS bars, no chart library. When a route has no data the bar is empty and says so,
 * rather than drawing a zero that could be mistaken for a measurement.
 */

import type { RoutingLogRow } from "../state/routingLog";

function average(rows: RoutingLogRow[], source: "on_device" | "in_cloud"): { ms: number | null; count: number } {
  const matching = rows.filter((row) => row.actual === source && row.latencyMs > 0);
  if (matching.length === 0) return { ms: null, count: 0 };
  const total = matching.reduce((sum, row) => sum + row.latencyMs, 0);
  return { ms: Math.round(total / matching.length), count: matching.length };
}

export function LatencyBars({ rows }: { rows: RoutingLogRow[] }) {
  const device = average(rows, "on_device");
  const cloud = average(rows, "in_cloud");

  // Scale to the slower of the two, so the comparison is honest and readable at any magnitude.
  const ceiling = Math.max(device.ms ?? 0, cloud.ms ?? 0, 1);

  const bars = [
    { key: "device", label: "on this device", glyph: "⚡", ...device, bar: "bg-device", text: "text-device" },
    { key: "cloud", label: "in the cloud", glyph: "☁️", ...cloud, bar: "bg-cloud", text: "text-cloud" },
  ];

  return (
    <div className="space-y-2">
      {bars.map((entry) => (
        <div key={entry.key}>
          <div className="mb-1 flex items-baseline justify-between gap-2 text-[11px]">
            <span className="flex items-center gap-1.5 text-muted">
              <span aria-hidden="true">{entry.glyph}</span>
              {entry.label}
            </span>
            <span className={`font-display text-[12.5px] font-semibold tabular-nums ${entry.ms === null ? "text-muted" : entry.text}`}>
              {entry.ms === null ? "no data" : `${entry.ms} ms`}
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-panel-2" role="presentation">
            <div
              className={`h-full rounded-full ${entry.bar} transition-[width] duration-500`}
              style={{ width: entry.ms === null ? "0%" : `${Math.max(4, (entry.ms / ceiling) * 100)}%` }}
            />
          </div>
          {entry.count > 0 ? (
            <p className="mt-1 text-[10px] text-muted/70">
              average of {entry.count} {entry.count === 1 ? "answer" : "answers"}
            </p>
          ) : null}
        </div>
      ))}
    </div>
  );
}
