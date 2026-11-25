/**
 * Quiz — turn pasted notes into active-recall material.
 *
 * The two actions map onto the two halves of the hybrid story: flashcards are a
 * light task (policy prefers this device), a full practice exam is heavy (policy
 * prefers the cloud). Neither button promises a route; both report the one that
 * actually happened.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { runInference } from "../ai/engine";
import { CAPACITY_RETRY_DELAYS_MS, isCapacityCode } from "../ai/retry";
import type { AppError } from "../ai/errors";
import { detectScript } from "../ai/language";
import { parseFlashcards, splitMarkdownSections } from "../ai/parse";
import type { InferenceMode, InferenceSource, TaskKind } from "../ai/policy";
import { decideRoute } from "../ai/policy";
import type { Flashcard } from "../ai/prompts";
import { RouteBadge } from "../components/RouteBadge";
import { BentoCard, BentoGrid } from "../components/bento";
import { Button, Chip } from "../components/ui";
import { clearQuizSnapshot, readQuizSnapshot, writeQuizSnapshot } from "../state/quizStore";
import { useDraft } from "../state/useDraft";
import { useApp } from "../state/appContext";
import { logRoute } from "../state/routingLog";

const SAMPLE = `Photosynthesis is the process by which green plants convert light energy into chemical energy. It happens in two stages. The light-dependent reactions occur in the thylakoid membranes, where photosystem II splits water, releasing oxygen and producing ATP and NADPH. The light-independent reactions, or Calvin cycle, occur in the stroma, where carbon dioxide is fixed by RuBisCO into three-carbon compounds that are reduced using ATP and NADPH to form glucose. Limiting factors include light intensity, carbon dioxide concentration and temperature.`;

interface Meta {
  mode: InferenceMode;
  actual: InferenceSource | null;
  reason: string;
  latencyMs: number;
}

export function QuizPage() {
  const { policy, deviceAvailability, online, userMode, pushToast } = useApp();
  const [notes, setNotes] = useDraft("quiz-notes");
  const [busy, setBusy] = useState<TaskKind | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [failure, setFailure] = useState<{ message: string; hint?: string; task: TaskKind } | null>(null);
  // An exam costs about a minute to produce, so the last result is restored from a
  // local snapshot. Read once, then seed each piece of state from it: an effect that
  // called four setters on mount would be a needless extra render.
  const [restored] = useState(readQuizSnapshot);
  const [cards, setCards] = useState<Flashcard[] | null>(() => restored?.cards ?? null);
  const [rawFallback, setRawFallback] = useState<string | null>(() => restored?.rawFallback ?? null);
  const [exam, setExam] = useState<string | null>(() => restored?.exam ?? null);
  const [revealed, setRevealed] = useState<Set<number>>(new Set());
  const [meta, setMeta] = useState<Meta | null>(() => restored?.meta ?? null);

  /** Drop restored material and the snapshot behind it. */
  function clearResults() {
    clearQuizSnapshot();
    setCards(null);
    setRawFallback(null);
    setExam(null);
    setMeta(null);
    setRevealed(new Set());
  }

  // The exam is the longest operation in the app; a static label looks hung.
  useEffect(() => {
    if (!busy) return;
    const startedAt = performance.now();
    const timer = window.setInterval(() => setElapsedMs(performance.now() - startedAt), 500);
    return () => window.clearInterval(timer);
  }, [busy]);

  const expected = useMemo(() => {
    const text = notes.trim() || "x";
    const base = {
      text,
      userMode,
      availability: deviceAvailability,
      online,
      policy,
      unsupportedScriptDetected: detectScript(text, policy.onDeviceLanguages).unsupportedForOnDevice,
    };
    return {
      flashcards: decideRoute({ ...base, taskKind: "flashcards" }),
      exam: decideRoute({ ...base, taskKind: "exam" }),
    };
  }, [notes, userMode, deviceAvailability, online, policy]);

  /**
   * Same budget as the Ask page: the free tier slots in requests at ~20 s, so a throttled
   * generation gets 20 s and then 45 s before the failure card is shown. Visible, cancellable,
   * and bounded — an exam that silently retried forever would be worse than one that failed.
   */
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef<number | null>(null);
  const [retrying, setRetrying] = useState<{ attempt: number; task: TaskKind } | null>(null);

  // Leaving the page must not leave a retry armed: it would fire an inference with no UI,
  // spending a scarce free-tier request on an answer nobody can see.
  useEffect(
    () => () => {
      if (retryTimerRef.current !== null) window.clearTimeout(retryTimerRef.current);
    },
    [],
  );

  const cancelRetry = useCallback(() => {
    if (retryTimerRef.current !== null) window.clearTimeout(retryTimerRef.current);
    retryTimerRef.current = null;
    setRetrying(null);
  }, []);

  async function run(task: TaskKind, isRetry = false) {
    const text = notes.trim();
    if (!text || busy) return;
    if (!isRetry) {
      // A fresh request means the user has moved on: a retry armed for the previous one
      // must not fire later and replace what they asked for.
      if (retryTimerRef.current !== null) window.clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
      setRetrying(null);
      retryCountRef.current = 0;
    }
    setBusy(task);
    setElapsedMs(0);
    setFailure(null);
    setCards(null);
    setRawFallback(null);
    setExam(null);
    setRevealed(new Set());

    try {
      const result = await runInference({
        text,
        taskKind: task,
        userMode,
        policy,
        availability: deviceAvailability,
        online,
      });

      if (task === "flashcards") {
        const parsed = parseFlashcards(result.text);
        if (parsed.ok) {
          setCards(parsed.cards);
        } else {
          setRawFallback(parsed.fallbackText);
        }
      } else {
        setExam(result.text);
      }

      setMeta({
        mode: result.predicted.inferenceMode,
        actual: result.actual,
        reason: result.predicted.reason,
        latencyMs: result.latencyMs,
      });

      writeQuizSnapshot({
        task,
        cards: task === "flashcards" ? (parseFlashcards(result.text).ok ? parseFlashcards(result.text).cards : null) : null,
        exam: task === "exam" ? result.text : null,
        rawFallback: task === "flashcards" && !parseFlashcards(result.text).ok ? parseFlashcards(result.text).fallbackText ?? null : null,
        meta: {
          mode: result.predicted.inferenceMode,
          actual: result.actual,
          reason: result.predicted.reason,
          latencyMs: result.latencyMs,
        },
      });

      logRoute({
        taskKind: task,
        chars: text.length,
        predictedMode: result.predicted.inferenceMode,
        reason: result.predicted.reason,
        actual: result.actual,
        latencyMs: result.latencyMs,
        degraded: result.predicted.degraded,
      });
    } catch (error) {
      const appErr = error as AppError;
      const capacity = isCapacityCode(appErr.code);

      if (capacity && retryCountRef.current < CAPACITY_RETRY_DELAYS_MS.length) {
        const delay = CAPACITY_RETRY_DELAYS_MS[retryCountRef.current];
        retryCountRef.current += 1;
        setBusy(null);
        setRetrying({ attempt: retryCountRef.current, task });
        pushToast({
          kind: "info",
          message: `The free tier is rate-limiting requests. Retrying in ${Math.round(delay / 1000)}s…`,
          hint: "You can cancel; your notes are kept.",
        });
        retryTimerRef.current = window.setTimeout(() => {
          retryTimerRef.current = null;
          setRetrying(null);
          void run(task, true);
        }, delay);
        return;
      }

      // A failed attempt is a decision too (the Ask page records it for the same reason).
      logRoute({
        taskKind: task,
        chars: text.length,
        predictedMode: (task === "flashcards" ? expected.flashcards : expected.exam).inferenceMode,
        reason: (task === "flashcards" ? expected.flashcards : expected.exam).reason,
        actual: null,
        latencyMs: 0,
        degraded: false,
        error: appErr.code ?? "UNKNOWN",
      });

      // A toast disappears; a study tool should keep the failure and the way out on
      // screen, exactly like the Ask page does.
      setFailure({ message: appErr.message || "Generation failed.", hint: appErr.hint, task });
      pushToast({ kind: "error", message: appErr.message || "Generation failed.", hint: appErr.hint });
    } finally {
      setBusy(null);
    }
  }

  function toggle(index: number) {
    setRevealed((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  const examSections = exam ? splitMarkdownSections(exam) : [];

  return (
    <div className="space-y-3">
      <BentoGrid>
      <BentoCard span="lg:col-span-7 sm:col-span-6" label="Study notes">
        <p className="mb-3 text-[12px] leading-relaxed text-muted">
          Paste lecture notes or a textbook paragraph. Flashcards are light enough to run on this device; a full
          practice exam prefers the cloud model.
        </p>

        <textarea
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          rows={7}
          placeholder="Paste your notes here…"
          className="field w-full resize-y"
          aria-label="Study notes"
        />

        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <span className="text-[11.5px] text-muted">
            {notes.trim().length} characters
            {notes.length === 0 ? (
              <button type="button" className="ml-2 text-accent hover:underline" onClick={() => setNotes(SAMPLE)}>
                use a sample
              </button>
            ) : null}
          </span>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => void run("flashcards")} disabled={!notes.trim() || busy !== null}>
              {busy === "flashcards" ? "Generating…" : "Flashcards"}
              <span className="ml-2 text-[11px] text-muted">expect {expected.flashcards.inferenceMode === "only_in_cloud" ? "cloud" : "device"}</span>
            </Button>
            <Button variant="primary" onClick={() => void run("exam")} disabled={!notes.trim() || busy !== null}>
              {busy === "exam" ? "Writing exam…" : "10-question exam"}
              <span className="ml-2 text-[11px] text-muted">expect cloud</span>
            </Button>
          </div>
        </div>
        <p className="mt-1.5 text-[10.5px] leading-relaxed text-muted" aria-live="off">
          {busy ? (
            <>
              <span className="text-accent">
                {busy === "exam" ? "Writing the exam" : "Generating flashcards"}
                {elapsedMs > 1500 ? ` — ${Math.floor(elapsedMs / 1000)}s` : "…"}
              </span>
              <span className="text-muted"> · the badge afterwards reports which path ran</span>
            </>
          ) : (
            <>
              The exam is a long generation — about a minute in practice — and the badge afterwards reports which
              path actually ran.
            </>
          )}
        </p>

      </BentoCard>

      <BentoCard span="lg:col-span-5 sm:col-span-6" label="Predicted routes" accent="cloud">
        <p className="mb-3 text-[12px] leading-relaxed text-muted">
          Flashcards are light enough to stay on the device; a full exam prefers the cloud model. Neither button
          promises a route — both report the one that actually ran.
        </p>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between border-b border-line/50 py-1.5">
            <span className="text-[11.5px] text-muted">flashcards</span>
            <Chip tone={expected.flashcards.inferenceMode === "only_in_cloud" ? "cloud" : "device"}>
              {expected.flashcards.inferenceMode === "only_in_cloud" ? "cloud" : "on-device"}
            </Chip>
          </div>
          <div className="flex items-center justify-between border-b border-line/50 py-1.5">
            <span className="text-[11.5px] text-muted">10-question exam</span>
            <Chip tone="cloud">
              {expected.exam.inferenceMode === "only_in_cloud" || expected.exam.inferenceMode === "prefer_in_cloud" ? "cloud" : "on-device"}
            </Chip>
          </div>
          <div className="flex items-center justify-between py-1.5">
            <span className="text-[11.5px] text-muted">characters</span>
            <span className="text-[11.5px] tabular-nums text-ink">{notes.trim().length}</span>
          </div>
        </div>
        {expected.exam.degraded ? <Chip tone="warn">offline: exam runs on-device with reduced quality</Chip> : null}
      </BentoCard>
      </BentoGrid>

      {meta ? (
        <div className="flex flex-wrap items-center gap-2 px-1">
          <span className="text-[11.5px] text-muted">Last generation</span>
          <RouteBadge predictedMode={meta.mode} actual={meta.actual} latencyMs={meta.latencyMs} />
          <span className="text-[11.5px] text-muted">{meta.reason}</span>
        </div>
      ) : null}

      {retrying ? (
        <BentoCard span="lg:col-span-12 sm:col-span-6" label="Rate limited" accent="warn">
          <p className="text-[12.5px] leading-relaxed text-ink">
            The free tier is rate-limiting requests — retrying automatically (attempt {retrying.attempt + 1} of 3).
          </p>
          <p className="mt-1 text-[11.5px] leading-relaxed text-muted">
            Your notes are kept. This is the shared free-tier limit, not a fault in the app.
          </p>
          <div className="mt-3">
            <Button variant="ghost" onClick={cancelRetry}>
              Cancel
            </Button>
          </div>
        </BentoCard>
      ) : null}

      {failure ? (
        <BentoCard span="lg:col-span-12 sm:col-span-6" label="Generation failed" accent="danger">
          <p className="text-[13px] leading-relaxed text-ink">{failure.message}</p>
          {failure.hint ? <p className="mt-1 text-[12px] leading-relaxed text-muted">{failure.hint}</p> : null}
          <div className="mt-3 flex gap-2">
            <Button variant="secondary" onClick={() => void run(failure.task)} disabled={busy !== null}>
              Try again
            </Button>
            <Button variant="ghost" onClick={() => setFailure(null)}>
              Dismiss
            </Button>
          </div>
        </BentoCard>
      ) : null}

      {cards && cards.length > 0 ? (
        <BentoCard span="lg:col-span-12 sm:col-span-6" label={`${cards.length} flashcards`}
          meta={
            <div className="flex items-center gap-2">
              <span>click to reveal</span>
              <button
                type="button"
                onClick={clearResults}
                className="rounded px-1.5 py-0.5 text-[11px] text-muted transition-colors hover:text-ink"
              >
                clear
              </button>
            </div>
          }
        >
          <div className="grid gap-3 sm:grid-cols-2">
            {cards.map((card, index) => {
              const isRevealed = revealed.has(index);
              return (
                <button
                  key={`${card.front}-${index}`}
                  type="button"
                  onClick={() => toggle(index)}
                  className="min-h-[110px] rounded-xl border border-line bg-panel-2/60 p-4 text-left transition-colors hover:border-accent/40"
                  aria-expanded={isRevealed}
                >
                  <p className="text-[11px] uppercase tracking-wider text-muted">card {index + 1}</p>
                  <p className="mt-1 text-[13.5px] font-medium leading-relaxed text-ink">{card.front}</p>
                  {isRevealed ? (
                    <p className="mt-2 border-t border-line pt-2 text-[13px] leading-relaxed text-muted">{card.back}</p>
                  ) : (
                    <p className="mt-2 text-[12px] text-accent">reveal answer</p>
                  )}
                </button>
              );
            })}
          </div>
        </BentoCard>
      ) : null}

      {rawFallback ? (
        <BentoCard
          span="lg:col-span-12 sm:col-span-6"
          label="Model returned prose, not JSON"
          meta={
            <button
              type="button"
              onClick={clearResults}
              className="rounded px-1.5 py-0.5 text-[11px] text-muted transition-colors hover:text-ink"
            >
              clear
            </button>
          }
        >
          <p className="mb-2 text-[11.5px] leading-relaxed text-muted">
            On-device models do not always honour structured output. The raw answer is shown rather than discarded.
          </p>
          <pre className="whitespace-pre-wrap text-[13px] leading-relaxed text-ink">{rawFallback}</pre>
        </BentoCard>
      ) : null}

      {exam ? (
        <BentoCard
          span="lg:col-span-12 sm:col-span-6"
          label="Practice exam"
          meta={
            <button
              type="button"
              onClick={clearResults}
              className="rounded px-1.5 py-0.5 text-[11px] text-muted transition-colors hover:text-ink"
            >
              clear
            </button>
          }
        >
          <div className="space-y-4">
            {examSections.length > 0 ? (
              examSections.map((section, index) => (
                <div key={`${section.heading}-${index}`}>
                  {section.heading ? (
                    <h3 className="mb-1 text-[13px] font-semibold text-ink">{section.heading}</h3>
                  ) : null}
                  <div className="whitespace-pre-wrap text-[13px] leading-relaxed text-ink">{section.body}</div>
                </div>
              ))
            ) : (
              <pre className="whitespace-pre-wrap text-[13px] leading-relaxed text-ink">{exam}</pre>
            )}
          </div>
        </BentoCard>
      ) : null}

      {!cards && !exam && !rawFallback && busy === null ? (
        <p className="px-1 text-[11.5px] text-muted">
          Flashcards usually run on the device; the exam prefers the cloud. Both report where they actually ran.
        </p>
      ) : null}
    </div>
  );
}
