/** One chat turn, with the routing evidence attached to model answers. */

import { useState } from "react";

import type { InferenceMode, InferenceSource, RouteReason } from "../ai/policy";
import { RouteBadge } from "./RouteBadge";

const REASON_SHORT: Partial<Record<RouteReason, string>> = {
  "forced-device": "pinned to device",
  "forced-cloud": "pinned to cloud",
  "kill-switch": "remote config",
  "device-unavailable": "no device model",
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
}: ChatMessageProps) {  if (role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-md border border-line bg-panel-2 px-4 py-2.5">
          <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-ink">{text}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start">
      <div className="group w-full max-w-[92%] rounded-2xl rounded-bl-md border border-line bg-panel px-4 py-3">
        <div className="mb-2 flex flex-wrap items-center gap-2">
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
        <div className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-ink">{text}</div>

        {!streaming && text ? (
          <div className="mt-2 flex justify-end">
            <CopyButton text={text} />
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
