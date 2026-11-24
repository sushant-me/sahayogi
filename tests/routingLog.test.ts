import { describe, expect, it } from "vitest";

import type { RoutingLogRow } from "../src/state/routingLog";
import { exportRoutingLogJSON, summariseLog } from "../src/state/routingLog";

function row(overrides: Partial<RoutingLogRow> = {}): RoutingLogRow {
  return {
    id: "r1",
    at: 1_700_000_000_000,
    taskKind: "chat",
    chars: 40,
    predictedMode: "prefer_on_device",
    reason: "light-task",
    actual: "on_device",
    latencyMs: 120,
    degraded: false,
    agreed: true,
    device: "Chrome/158.0.8127.88",
    ...overrides,
  };
}

describe("summariseLog", () => {
  it("counts sources and disagreements", () => {
    const summary = summariseLog([
      row(),
      row({ id: "r2", actual: "in_cloud", agreed: false }),
      row({ id: "r3", actual: "in_cloud", agreed: true }),
    ]);
    expect(summary.total).toBe(3);
    expect(summary.onDevice).toBe(1);
    expect(summary.cloud).toBe(2);
    expect(summary.disagreements).toBe(1);
  });

  it("averages only rows that actually have a latency", () => {
    const summary = summariseLog([
      row({ id: "a", latencyMs: 100 }),
      row({ id: "b", latencyMs: 300 }),
      row({ id: "c", latencyMs: 0 }),
    ]);
    expect(summary.avgLatency).toBe(200);
  });

  it("reports no average when nothing has run", () => {
    expect(summariseLog([]).avgLatency).toBeNull();
    expect(summariseLog([row({ latencyMs: 0 })]).avgLatency).toBeNull();
  });

  it("ignores rows with an unknown source when counting", () => {
    const summary = summariseLog([row({ actual: null, agreed: false })]);
    expect(summary.onDevice).toBe(0);
    expect(summary.cloud).toBe(0);
    expect(summary.total).toBe(1);
  });
});

describe("exportRoutingLogJSON", () => {
  it("emits parseable JSON with a summary and rows", () => {
    const parsed = JSON.parse(exportRoutingLogJSON([row()])) as {
      app: string;
      summary: { total: number; onDevice: number };
      rows: RoutingLogRow[];
      exportedAt: string;
    };
    expect(parsed.app).toBe("Sahayogi");
    expect(parsed.summary.total).toBe(1);
    expect(parsed.summary.onDevice).toBe(1);
    expect(parsed.rows).toHaveLength(1);
    expect(Number.isNaN(Date.parse(parsed.exportedAt))).toBe(false);
  });

  it("documents what the fields mean, so the file is self-explaining", () => {
    const parsed = JSON.parse(exportRoutingLogJSON([])) as { schema: Record<string, string> };
    expect(Object.keys(parsed.schema).sort()).toEqual(["actual", "agreed", "predictedMode"]);
    expect(parsed.schema.actual).toMatch(/reported by the SDK/i);
  });

  it("keeps a disagreement visible rather than normalising it away", () => {
    const parsed = JSON.parse(
      exportRoutingLogJSON([row({ actual: "in_cloud", agreed: false })]),
    ) as { rows: RoutingLogRow[]; summary: { disagreements: number } };
    expect(parsed.rows[0].agreed).toBe(false);
    expect(parsed.summary.disagreements).toBe(1);
  });

  it("handles an empty ledger", () => {
    const parsed = JSON.parse(exportRoutingLogJSON([])) as { summary: { total: number }; rows: unknown[] };
    expect(parsed.summary.total).toBe(0);
    expect(parsed.rows).toEqual([]);
  });
});
