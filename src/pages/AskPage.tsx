/**
 * Ask — the main chat surface.
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
import { DevicePreflight } from "../components/DevicePreflight";
import { ModeToggle } from "../components/ModeToggle";
import { OfflineBanner } from "../components/OfflineBanner";
import { RouteBadge } from "../components/RouteBadge";
import { Button, Chip, EmptyState, Panel, SectionHeading } from "../components/ui";
import { useApp } from "../state/appContext";
import { logRoute } from "../state/routingLog";
import { appendMessage, createChat } from "../store/chatStore";

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
  {
    label: "Light question",
    text: "Explain Ohm's law in two sentences with the formula.",
  },
  {
    label: "नेपाली प्रश्न",
    text: "किर्कहफको नियम सरल भाषामा बुझाउनुहोस् र एउटा उदाहरण दिनुहोस्।",
  },
  {
    label: "Long notes (over threshold)",
    text: `Summarise these study notes for revision.
Thevenin's theorem states that any linear electrical network with voltage and current sources and only resistances can be replaced at terminals A-B by an equivalent voltage source Vth in series connection with an equivalent resistance Rth. The equivalent voltage Vth is the voltage obtained at terminals A-B of the network with terminals A-B open circuited. The equivalent resistance Rth is the resistance that the circuit has measured between terminals A-B when all independent voltage sources are shorted and all independent current sources are open circuited. The theorem is especially useful for analysing power systems and other circuits where the load is variable while the rest of the network stays fixed. It applies only to linear networks; circuits with non-linear elements such as diodes cannot be reduced this way. Superposition is used to derive it: the response of a linear circuit to several sources equals the sum of the responses to each source acting alone. Norton's theorem is the dual result, replacing the network with a current source in parallel with a resistance. Maximum power transfer occurs when the load resistance equals the Thevenin resistance, at which point efficiency is fifty percent and the remaining power is dissipated in the source resistance, which is why power systems are not designed for maximum power transfer but for high efficiency.`,
  },
];

const REASON_PREVIEW: Record<RouteReason, string> = {
  "forced-device": "pinned to device",
  "forced-cloud": "pinned to cloud",
  "kill-switch": "disabled by remote config",
  "device-unavailable": "no device model available",
  "unsupported-language": "this language is cloud-only",
  "heavy-task": "heavy task",
  "long-prompt": "over the length threshold",
  "offline-degraded": "offline — reduced quality",
  "light-task": "within threshold",
};

function nextId(): string {
  return `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function AskPage() {
  const { policy, deviceAvailability, online, userMode, setUserMode, uid, pushToast } = useApp();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const chatIdRef = useRef<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

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

  async function persist(chatIdOwner: string | null, userText: string, result: {
    text: string;
    predictedMode: InferenceMode;
    actual: InferenceSource | null;
    reason: RouteReason;
    latencyMs: number;
  }) {
    if (!chatIdOwner) return;
    try {
      if (!chatIdRef.current) {
        chatIdRef.current = await createChat(chatIdOwner, userText.slice(0, 60));
      }
      const chatId = chatIdRef.current;
      await appendMessage(chatIdOwner, chatId, {
        role: "user",
        text: userText,
        actualSource: null,
        predictedMode: result.predictedMode,
        reason: result.reason,
        latencyMs: null,
      });
      await appendMessage(chatIdOwner, chatId, {
        role: "model",
        text: result.text,
        actualSource: result.actual,
        predictedMode: result.predictedMode,
        reason: result.reason,
        latencyMs: result.latencyMs,
      });
    } catch (error) {
      // Persistence failing must not lose the answer already on screen.
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
      {
        id: nextId(),
        role: "user",
        text,
        predictedMode: null,
        actual: null,
        reason: "none",
        latencyMs: null,
      },
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

      logRoute({
        taskKind: "chat",
        chars: text.length,
        predictedMode: result.predicted.inferenceMode,
        reason: result.predicted.reason,
        actual: result.actual,
        latencyMs: result.latencyMs,
        degraded: result.predicted.degraded,
      });

      await persist(uid, text, {
        text: result.text,
        predictedMode: result.predicted.inferenceMode,
        actual: result.actual,
        reason: result.predicted.reason,
        latencyMs: result.latencyMs,
      });
    } catch (error) {
      const appErr = error as AppError;
      pushToast({
        kind: "error",
        message: appErr.message || "Inference failed.",
        hint: appErr.hint,
      });
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

  return (
    <div className="space-y-4">
      <Panel className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <SectionHeading title="Ask anything you are studying" />
            <p className="-mt-4 text-[12.5px] text-muted">
              Light questions stay on this device. Long or heavy ones go to the cloud — through the same SDK.
            </p>
          </div>
          <ModeToggle value={userMode} onChange={setUserMode} disabled={sending} />
        </div>
      </Panel>

      {!online ? <OfflineBanner availability={deviceAvailability} /> : null}

      {deviceAvailability !== "available" ? <DevicePreflight /> : null}

      <Panel className="flex min-h-[380px] flex-col p-4">
        {turns.length === 0 && !sending ? (
          <div className="grid flex-1 place-items-center">
            <EmptyState
              title="Nothing asked yet"
              body="Try one of these. The third is deliberately long, so you can watch the router send it to the cloud while the first stays on-device."
              action={
                <div className="flex flex-wrap justify-center gap-2">
                  {EXAMPLES.map((example) => (
                    <Button key={example.label} variant="ghost" onClick={() => void send(example.text)}>
                      {example.label}
                    </Button>
                  ))}
                </div>
              }
            />
          </div>
        ) : (
          <div className="flex-1 space-y-4">
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
      </Panel>

      <Panel className="p-3">
        {preview ? (
          <div className="mb-2 flex flex-wrap items-center gap-2 px-1">
            <span className="text-[11.5px] text-muted">Route preview</span>
            <RouteBadge predictedMode={preview.inferenceMode} actual={null} compact variant="preview" />
            <span className="text-[11.5px] text-muted">
              {REASON_PREVIEW[preview.reason]} · {preview.diagnostics.chars} chars
            </span>
            {preview.degraded ? <Chip tone="warn">reduced quality offline</Chip> : null}
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
            className="field min-h-[54px] flex-1 resize-y"
            aria-label="Your question"
          />
          <Button variant="primary" onClick={() => void send(input)} disabled={sending || !input.trim()}>
            {sending ? "Working…" : "Send"}
          </Button>
        </div>
        <p className="mt-2 px-1 text-[11px] text-muted">
          Enter sends, Shift+Enter adds a line. Nothing is sent to the cloud when the answer runs on-device.
        </p>
      </Panel>
    </div>
  );
}
