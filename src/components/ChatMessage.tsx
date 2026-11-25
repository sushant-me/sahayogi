/** One chat turn, with the routing evidence attached to model answers. */

import { useState } from "react";

import type { InferenceMode, InferenceSource, RouteReason } from "../ai/policy";
import { AnswerText } from "./AnswerText";
import { RouteBadge } from "./RouteBadge";

const REASON_SHORT: Partial<Record<RouteReason, string>> = {
  "forced-device": "pinned to device",
  "forced-cloud": "pinned to cloud",
  "kill-switch": "remote config",
  "device-unavailable": "no device model",
  "device-not-ready": "model not downloaded",
  "unsupported-language": "language cloud-only",
  "heavy-task": "heavy task",
  "long-prompt": "long prompt",
  "offline-degraded": "offline, reduced quality",
  "light-task": "light prompt",
};

export interface ChatMessageProps {
  role: "user" | "model";
  text: string;
  predictedMode?: InferenceMode | null;
  actual?: InferenceSource | null;
  reason?: RouteReason | "none";
  latencyMs?: number | null;
  syncedOffline?: boolean;
  streaming?: boolean;
  /** Present only on failed answers: retry the same question. */
  onRetry?: () => void;
  /**
   * A live counter shown next to a "thinking" placeholder. Hidden from assistive tech:
   * it changes every second, and announcing that would drown out the answer itself.
   */
  statusSuffix?: string | null;
}

export function ChatMessage({
  role,
  text,
  predictedMode = null,
  actual = null,
  reason = "none",
  latencyMs = null,
  syncedOffline = false,
  streaming = false,
  onRetry,
  statusSuffix = null,
}: ChatMessageProps) {  if (role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[78%] rounded-2xl rounded-br-sm bg-panel-2 px-4 py-2.5">
          <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-ink/90">{text}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start animate-message-in">
      {/* No bubble: the answer is the page, not a card inside it. */}
      <div className="group w-full max-w-2xl py-1">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <RouteBadge
            predictedMode={predictedMode}
            actual={actual}
            latencyMs={latencyMs}
            variant={actual === null ? "preview" : "actual"}
          />
          {reason !== "none" ? (
            <span className="text-[11px] text-muted">{REASON_SHORT[reason] ?? reason}</span>
          ) : null}
          {syncedOffline ? (
            <span className="text-[11px] text-warn">written offline, queued to sync</span>
          ) : null}
          {streaming ? <span className="text-[11px] text-accent">streaming…</span> : null}
        </div>
        {statusSuffix ? (
          <div className="flex flex-wrap items-baseline gap-1.5">
            <AnswerText text={text} />
            <span aria-hidden="true" className="text-[11px] tabular-nums text-muted">
              {statusSuffix}
            </span>
          </div>
        ) : (
          <AnswerText text={text} />
        )}

        {!streaming && (text || onRetry) ? (
          <div className="mt-2 flex items-center justify-end gap-2">
            {onRetry ? (
              <button
                type="button"
                onClick={onRetry}
                className="rounded-md border border-line px-2 py-1 text-[11px] font-medium text-ink transition-colors hover:border-accent/50 hover:text-accent"
              >
                Try again
              </button>
            ) : null}
            {text ? <CopyButton text={text} /> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** Copies the answer. Silent no-op where the clipboard API is unavailable. */
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked (permissions/insecure context): leave the UI unchanged
      // rather than claiming success.
    }
  }

  return (
    <button
      type="button"
      onClick={() => void copy()}
      className="rounded px-1.5 py-0.5 text-[11px] text-muted opacity-0 transition-opacity hover:text-ink focus-visible:opacity-100 group-hover:opacity-100"
      aria-label={copied ? "Copied" : "Copy answer"}
    >
      {copied ? "copied" : "copy"}
    </button>
  );
}
