/**
 * Route badge.
 *
 * Renders what the SDK reports, never what we hoped for. When the prediction and
 * the SDK disagree the badge says "cloud (fallback)" instead of quietly showing
 * the same cloud pill — that difference is the most valuable signal the product
 * emits, so it is surfaced rather than smoothed over.
 *
 * `variant="preview"` is for the route preview and the streaming placeholder:
 * those show a prediction, and they are styled as a prediction (dashed, muted) so
 * nobody mistakes a plan for evidence.
 */

import { badgeForMode, badgeForPreview } from "../ai/policy";
import type { InferenceMode, InferenceSource } from "../ai/policy";

const GLYPHS = {
  device: "⚡",
  cloud: "☁️",
  "cloud-fallback": "☁️",
} as const;

export function RouteBadge({
  predictedMode,
  actual,
  latencyMs,
  compact = false,
  variant = "actual",
}: {
  predictedMode: InferenceMode | null;
  actual: InferenceSource | null;
  latencyMs?: number | null;
  compact?: boolean;
  variant?: "actual" | "preview";
}) {
  if (!predictedMode) return null;

  const isPreview = variant === "preview" && actual === null;
  const model = isPreview ? badgeForPreview(predictedMode) : badgeForMode(predictedMode, actual);

  const tone = isPreview
    ? "preview"
    : model.glyph === "device"
      ? "device"
      : model.glyph === "cloud-fallback"
        ? "warn"
        : "cloud";

  return (
    <span
      // A result flips in: the prediction was dashed and muted, the outcome lands in its own
      // semantic colour. 300ms, and prefers-reduced-motion collapses it to nothing.
      className={`badge badge-${tone}${isPreview ? "" : " animate-badge-flip"}`}
      title={model.title}
    >
      <span aria-hidden="true">{GLYPHS[model.glyph]}</span>
      <span className="font-medium">{model.label}</span>
      {isPreview ? <span className="text-[10.5px] uppercase tracking-wide opacity-70">predicted</span> : null}
      {!compact && !isPreview && latencyMs ? (
        <span className="text-[11px] text-muted">{latencyMs} ms</span>
      ) : null}
      {model.disagreed ? <span className="text-[11px] text-warn">prediction missed</span> : null}
    </span>
  );
}
