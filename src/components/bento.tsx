/**
 * Bento grid primitives.
 *
 * A 12-column grid where each tile declares its own span, so the page reads as a
 * composed dashboard rather than a stack of full-width panels. Tiles share one
 * surface treatment (border, radius, inner highlight) so the grid looks like a set
 * rather than a collection of unrelated boxes.
 */

import type { ReactNode } from "react";

export type BentoAccent = "neutral" | "device" | "cloud" | "warn" | "danger";

const ACCENT_RING: Record<BentoAccent, string> = {
  neutral: "border-line/80",
  device: "border-device/25",
  cloud: "border-cloud/25",
  warn: "border-warn/30",
  danger: "border-danger/30",
};

const ACCENT_GLOW: Record<BentoAccent, string> = {
  neutral: "before:bg-white/[0.04]",
  device: "before:bg-device/25",
  cloud: "before:bg-cloud/25",
  warn: "before:bg-warn/25",
  danger: "before:bg-danger/25",
};

export function BentoGrid({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`grid grid-cols-1 gap-3 sm:grid-cols-6 lg:grid-cols-12 ${className}`}>
      {children}
    </div>
  );
}

export interface BentoCardProps {
  children: ReactNode;
  /** Grid span per breakpoint, e.g. "lg:col-span-8 sm:col-span-6". */
  span?: string;
  label?: string;
  meta?: ReactNode;
  accent?: BentoAccent;
  className?: string;
  /** Remove inner padding for cards that manage their own (chat, lists). */
  flush?: boolean;
}

export function BentoCard({
  children,
  span = "lg:col-span-4 sm:col-span-6",
  label,
  meta,
  accent = "neutral",
  className = "",
  flush = false,
}: BentoCardProps) {
  return (
    <section
      className={[
        "group relative isolate overflow-hidden rounded-2xl border bg-panel",
        "bg-gradient-to-b from-white/[0.022] to-transparent",
        "shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05),0_1px_3px_rgba(0,0,0,0.35)]",
        "transition-colors hover:border-line",
        ACCENT_RING[accent],
        ACCENT_GLOW[accent],
        // soft accent wash in the top-left corner, subtle enough to stay quiet
        "before:pointer-events-none before:absolute before:-left-10 before:-top-10 before:-z-10",
        "before:h-36 before:w-36 before:rounded-full before:blur-3xl before:opacity-70",
        span,
        className,
      ].join(" ")}
    >
      {/* flex-wrap matters on phones: a card whose meta is a control (the mode toggle) is
          wider than 390px minus padding, and without wrapping the last segment falls off the
          screen edge instead of moving to its own line. */}
      {label || meta ? (
        <header className={`flex flex-wrap items-start justify-between gap-3 ${flush ? "px-4 pb-2 pt-3.5" : "px-4 pt-3.5"}`}>
          <h2 className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted">{label}</h2>
          {meta ? <div className="min-w-0 text-[11px] text-muted">{meta}</div> : null}
        </header>
      ) : null}
      <div className={flush ? "" : "px-4 pb-4 pt-1.5"}>{children}</div>
    </section>
  );
}

/** Large numeral for a tile, e.g. the on-device count. */
export function BentoMetric({
  value,
  unit,
  tone = "text-ink",
}: {
  value: ReactNode;
  unit?: string;
  tone?: string;
}) {
  return (
    <p className={`flex items-baseline gap-1 text-[26px] font-semibold leading-none tabular-nums tracking-tight ${tone}`}>
      {value}
      {unit ? <span className="text-[12px] font-medium text-muted">{unit}</span> : null}
    </p>
  );
}

/** Key/value line used inside tiles. */
export function BentoRow({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line/50 py-1.5 last:border-b-0">
      <span className="text-[11.5px] text-muted">{k}</span>
      <span className="text-right text-[11.5px] font-medium text-ink">{children}</span>
    </div>
  );
}
