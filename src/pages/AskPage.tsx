/**
 * Ask — the main surface, laid out as a bento dashboard.
 *
 * Two things make this page different from a generic chat UI:
 *  1. a live route preview, computed by the same pure policy the engine uses,
 *     so the decision is visible before the request is even sent;
 *  2. every answer carries the SDK's own `inferenceSource` report.
 */

import { useEffect, useMemo, useRef, useState } from "react";

import { runInference } from "../ai/engine";
import type { AppError } from "../ai/errors";
import { detectScript } from "../ai/language";
import type { InferenceMode, InferenceSource, RouteReason } from "../ai/policy";
import { decideRoute } from "../ai/policy";
import { ChatMessage } from "../components/ChatMessage";
import { ModeToggle } from "../components/ModeToggle";
import { OfflineBanner } from "../components/OfflineBanner";
import { RouteBadge } from "../components/RouteBadge";
import { BentoCard, BentoGrid, BentoMetric, BentoRow } from "../components/bento";
import { Button, Chip } from "../components/ui";
import { useApp } from "../state/appContext";
import { logRoute, summariseLog, useRoutingLog } from "../state/routingLog";
import { getPersistence } from "../store/persistence";

interface Turn {
  id: string;
  role: "user" | "model";
  text: string;
  predictedMode: InferenceMode | null;
  actual: InferenceSource | null;
  reason: RouteReason | "none";
  latencyMs: number | null;
}

const EXAMPLES: Array<{ label: string; text: string }> = [
  { label: "Light question", text: "Explain Ohm's law in two sentences with the formula." },
  {
    label: "नेपाली प्रश्न",
    text: "किर्कहफको नियम सरल भाषामा बुझाउनुहोस् र एउटा उदाहरण दिनुहोस्।",
  },
  {
    label: "Long notes",
    text: `Summarise these study notes for revision.
Thevenin's theorem states that any linear electrical network with voltage and current sources and only resistances can be replaced at terminals A-B by an equivalent voltage source Vth in series connection with an equivalent resistance Rth. The equivalent voltage Vth is the voltage obtained at terminals A-B of the network with terminals A-B open circuited. The equivalent resistance Rth is the resistance that the circuit has measured between terminals A-B when all independent voltage sources are shorted and all independent current sources are open circuited. The theorem is especially useful for analysing power systems and other circuits where the load is variable while the rest of the network stays fixed. It applies only to linear networks; circuits with non-linear elements such as diodes cannot be reduced this way. Superposition is used to derive it: the response of a linear circuit to several sources equals the sum of the responses to each source acting alone. Norton's theorem is the dual result. Maximum power transfer occurs when the load resistance equals the Thevenin resistance.`,
  },
];

const REASON_PREVIEW: Record<RouteReason, string> = {
  "forced-device": "pinned to device",
  "forced-cloud": "pinned to cloud",
  "kill-switch": "disabled by remote config",
  "device-unavailable": "no device model available",
  "device-not-ready": "model not downloaded yet",
  "unsupported-language": "this language is cloud-only",
  "heavy-task": "heavy task",
  "long-prompt": "over the length threshold",
  "offline-degraded": "offline — reduced quality",
  "light-task": "within threshold",
};

function nextId(): string {
  return `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

const AVAILABILITY_LABEL: Record<string, string> = {
  available: "ready",
  downloadable: "not downloaded",
  downloading: "downloading",
  unavailable: "unavailable",
  unsupported: "no Prompt API",
};

export function AskPage() {
  const {
    policy,
    deviceAvailability,
    deviceChecking,
    online,
    userMode,
    setUserMode,
    uid,
    pushToast,
    preflight,
    startPreflight,
    refreshDevice,
  } = useApp();

  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const chatIdRef = useRef<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const routingLog = useRoutingLog();
  const summary = useMemo(() => summariseLog(routingLog), [routingLog]);

  const preview = useMemo(() => {
    const text = input.trim();
    if (!text) return null;
    return decideRoute({
      text,
      taskKind: "chat",
      userMode,
      availability: deviceAvailability,
      online,
      policy,
      unsupportedScriptDetected: detectScript(text, policy.onDeviceLanguages).unsupportedForOnDevice,
    });
  }, [input, userMode, deviceAvailability, online, policy]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [turns, streamingText]);

  async function persist(userText: string, result: {
    text: string;
    predictedMode: InferenceMode;
    actual: InferenceSource | null;
    reason: RouteReason;
    latencyMs: number;
  }) {
    const store = getPersistence(uid);
    try {
      if (!chatIdRef.current) chatIdRef.current = await store.createChat(userText.slice(0, 60));
      const chatId = chatIdRef.current;
      await store.appendMessage(chatId, {
        role: "user",
        text: userText,
        actualSource: null,
        predictedMode: result.predictedMode,
        reason: result.reason,
        latencyMs: null,
      });
      await store.appendMessage(chatId, {
        role: "model",
        text: result.text,
        actualSource: result.actual,
        predictedMode: result.predictedMode,
        reason: result.reason,
        latencyMs: result.latencyMs,
      });
    } catch (error) {
      pushToast({
        kind: "error",
        message: "Answer shown, but it could not be saved to history.",
        hint: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async function send(raw: string) {
    const text = raw.trim();
    if (!text || sending) return;

    setSending(true);
    setInput("");
    setStreamingText("");
    setTurns((current) => [
      ...current,
      { id: nextId(), role: "user", text, predictedMode: null, actual: null, reason: "none", latencyMs: null },
    ]);

    try {
      const result = await runInference({
        text,
        taskKind: "chat",
        userMode,
        policy,
        availability: deviceAvailability,
        online,
        onToken: (chunk) => setStreamingText((current) => current + chunk),
      });

      setTurns((current) => [
        ...current,
        {
          id: nextId(),
          role: "model",
          text: result.text,
          predictedMode: result.predicted.inferenceMode,
          actual: result.actual,
          reason: result.predicted.reason,
          latencyMs: result.latencyMs,
        },
      ]);

      // Clear the placeholder *before* persisting: the Firestore write can take a
      // moment, and during it the final bubble plus the streaming bubble would
      // both render, showing the same answer twice.
      setSending(false);
      setStreamingText("");

      logRoute({
        taskKind: "chat",
        chars: text.length,
        predictedMode: result.predicted.inferenceMode,
        reason: result.predicted.reason,
        actual: result.actual,
        latencyMs: result.latencyMs,
        degraded: result.predicted.degraded,
        model: result.modelUsed,
      });

      await persist(text, {
        text: result.text,
        predictedMode: result.predicted.inferenceMode,
        actual: result.actual,
        reason: result.predicted.reason,
        latencyMs: result.latencyMs,
      });
    } catch (error) {
      const appErr = error as AppError;
      pushToast({ kind: "error", message: appErr.message || "Inference failed.", hint: appErr.hint });
      setTurns((current) => [
        ...current,
        {
          id: nextId(),
          role: "model",
          text: `No answer. ${appErr.hint ?? ""}`.trim(),
          predictedMode: null,
          actual: null,
          reason: "none",
          latencyMs: null,
        },
      ]);
    } finally {
      setSending(false);
      setStreamingText("");
    }
  }

  const deviceReady = deviceAvailability === "available";
  const canDownload = deviceAvailability === "downloadable" || deviceAvailability === "downloading";

  return (
    <div className="space-y-3">
      {!online ? <OfflineBanner availability={deviceAvailability} /> : null}

      <BentoGrid>
        {/* ── conversation ───────────────────────────────────────────── */}
        <BentoCard
          span="lg:col-span-8 sm:col-span-6"
          label="Conversation"
          flush
          accent="neutral"
          meta={<ModeToggle value={userMode} onChange={setUserMode} disabled={sending} />}
        >
          <div className="flex min-h-[430px] flex-col">
            <div className="flex-1 px-4 pb-2" role="log" aria-live="polite" aria-relevant="additions text" aria-label="Conversation">
              {turns.length === 0 && !sending ? (
                <div className="grid h-full place-items-center py-12">
                  <div className="max-w-md text-center">
                    <p className="text-[15px] font-medium tracking-tight text-ink">Nothing asked yet</p>
                    <p className="mx-auto mt-1.5 max-w-sm text-[12.5px] leading-relaxed text-muted">
                      Start with one of these. The third is deliberately long, so you can watch the router send it to
                      the cloud while the first stays on-device.
                    </p>
                    <div className="mt-4 flex flex-wrap justify-center gap-1.5">
                      {EXAMPLES.map((example) => (
                        <Button key={example.label} variant="secondary" onClick={() => void send(example.text)}>
                          {example.label}
                        </Button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-4 pt-2">
                  {turns.map((turn) => (
                    <ChatMessage
                      key={turn.id}
                      role={turn.role}
                      text={turn.text}
                      predictedMode={turn.predictedMode}
                      actual={turn.actual}
                      reason={turn.reason}
                      latencyMs={turn.latencyMs}
                    />
                  ))}
                  {sending ? (
                    <ChatMessage
                      role="model"
                      text={streamingText || "Thinking…"}
                      predictedMode={preview?.inferenceMode ?? null}
                      actual={null}
                      reason={preview?.reason ?? "none"}
                      streaming
                    />
                  ) : null}
                  <div ref={bottomRef} />
                </div>
              )}
            </div>

            <div className="border-t border-line/70 px-4 pb-4 pt-3">
              {preview ? (
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <RouteBadge predictedMode={preview.inferenceMode} actual={null} compact variant="preview" />
                  <span className="text-[11px] text-muted">
                    {REASON_PREVIEW[preview.reason]} · {preview.diagnostics.chars} chars
                  </span>
                  {preview.degraded ? <Chip tone="warn">reduced quality</Chip> : null}
                </div>
              ) : null}
              <div className="flex items-end gap-2">
                <textarea
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      void send(input);
                    }
                  }}
                  rows={2}
                  placeholder="Ask a question, or paste anything you are revising…"
                  className="field min-h-[52px] flex-1 resize-y"
                  aria-label="Your question"
                />
                <Button variant="primary" onClick={() => void send(input)} disabled={sending || !input.trim()}>
                  {sending ? "Working…" : "Send"}
                </Button>
              </div>
              <p className="mt-2 text-[10.5px] text-muted">
                Enter sends · Shift+Enter adds a line · nothing leaves this device when the answer runs on-device
              </p>
            </div>
          </div>
        </BentoCard>

        {/* ── right rail ─────────────────────────────────────────────── */}
        <div className="grid gap-3 sm:col-span-6 lg:col-span-4">
          <BentoCard
            span=""
            label="Route preview"
            accent={preview && preview.inferenceMode !== "prefer_on_device" && preview.inferenceMode !== "only_on_device" ? "cloud" : "device"}
            meta={<Chip tone="neutral">{userMode}</Chip>}
          >
            {preview ? (
              <div className="space-y-2">
                <RouteBadge predictedMode={preview.inferenceMode} actual={null} variant="preview" />
                <p className="text-[12px] leading-relaxed text-muted">{preview.explanation}</p>
                <div className="pt-1">
                  <BentoRow k="characters">{preview.diagnostics.chars}</BentoRow>
                  <BentoRow k="threshold">{preview.diagnostics.heavyThresholdChars}</BentoRow>
                  <BentoRow k="task">{preview.diagnostics.taskKind}</BentoRow>
                </div>
              </div>
            ) : (
              <p className="text-[12px] leading-relaxed text-muted">
                Start typing and the router shows which path it will take — before anything is sent.
              </p>
            )}
          </BentoCard>

          <BentoCard
            span=""
            label="On-device model"
            accent={deviceReady ? "device" : canDownload ? "warn" : "danger"}
            meta={<Chip tone={deviceReady ? "device" : canDownload ? "warn" : "danger"}>{deviceChecking ? "checking" : AVAILABILITY_LABEL[deviceAvailability] ?? deviceAvailability}</Chip>}
          >
            <p className="text-[12px] leading-relaxed text-muted">
              {deviceReady
                ? "Gemini Nano is installed. Light prompts stay on this machine."
                : canDownload
                  ? "The weights are not on disk. Download them once to keep light prompts local."
                  : "This browser cannot run the on-device model, so answers come from the cloud."}
            </p>
            {preflight.running && preflight.progress !== null ? (
              <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-line">
                <div className="h-full rounded-full bg-device" style={{ width: `${Math.round(preflight.progress * 100)}%` }} />
              </div>
            ) : null}
            <div className="mt-3 flex gap-2">
              <Button variant={canDownload ? "primary" : "secondary"} onClick={() => void startPreflight()} disabled={preflight.running || !canDownload}>
                {preflight.running ? "Preparing…" : "Enable offline"}
              </Button>
              <Button variant="ghost" onClick={() => void refreshDevice()} disabled={deviceChecking}>
                Re-check
              </Button>
            </div>
          </BentoCard>

          <BentoCard span="" label="This session" meta={<span>{summary.total} decisions</span>}>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <BentoMetric value={summary.onDevice} unit="on-device" tone="text-device" />
              </div>
              <div>
                <BentoMetric value={summary.cloud} unit="cloud" tone="text-cloud" />
              </div>
            </div>
            <div className="mt-2 border-t border-line/60 pt-1">
              <BentoRow k="prediction missed">{summary.disagreements}</BentoRow>
              <BentoRow k="avg latency">{summary.avgLatency !== null ? `${summary.avgLatency} ms` : "—"}</BentoRow>
            </div>
          </BentoCard>
        </div>
      </BentoGrid>

      {/* ── full-width strip ─────────────────────────────────────────── */}
      <BentoGrid>
        <BentoCard span="lg:col-span-12 sm:col-span-6" label="How this page decides" accent="neutral">
          <p className="max-w-4xl text-[12.5px] leading-relaxed text-muted">
            Short English prompts stay on-device once the model is installed. Long or heavy ones prefer the cloud.
            Devanagari is routed to the cloud deliberately, because the on-device model does not read it. Every answer
            records which path actually ran, and the badge shows the SDK's own report rather than the plan.
          </p>
        </BentoCard>
      </BentoGrid>
    </div>
  );
}
