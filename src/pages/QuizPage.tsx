/**
 * Quiz — turn pasted notes into active-recall material.
 *
 * The two actions map onto the two halves of the hybrid story: flashcards are a
 * light task (policy prefers this device), a full practice exam is heavy (policy
 * prefers the cloud). Neither button promises a route; both report the one that
 * actually happened.
 */

import { useEffect, useMemo, useState } from "react";

import { runInference } from "../ai/engine";
import type { AppError } from "../ai/errors";
import { detectScript } from "../ai/language";
import { parseFlashcards, splitMarkdownSections } from "../ai/parse";
import type { InferenceMode, InferenceSource, TaskKind } from "../ai/policy";
import { decideRoute } from "../ai/policy";
import type { Flashcard } from "../ai/prompts";
import { RouteBadge } from "../components/RouteBadge";
import { BentoCard, BentoGrid } from "../components/bento";
import { Button, Chip } from "../components/ui";
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
  const [cards, setCards] = useState<Flashcard[] | null>(null);
  const [rawFallback, setRawFallback] = useState<string | null>(null);
  const [exam, setExam] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<Set<number>>(new Set());
  const [meta, setMeta] = useState<Meta | null>(null);

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

  async function run(task: TaskKind) {
    const text = notes.trim();
    if (!text || busy) return;
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
        <BentoCard span="lg:col-span-12 sm:col-span-6" label={`${cards.length} flashcards`} meta={<span>click to reveal</span>}>
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
        <BentoCard span="lg:col-span-12 sm:col-span-6" label="Model returned prose, not JSON">
          <p className="mb-2 text-[11.5px] leading-relaxed text-muted">
            On-device models do not always honour structured output. The raw answer is shown rather than discarded.
          </p>
          <pre className="whitespace-pre-wrap text-[13px] leading-relaxed text-ink">{rawFallback}</pre>
        </BentoCard>
      ) : null}

      {exam ? (
        <BentoCard span="lg:col-span-12 sm:col-span-6" label="Practice exam">
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
        <BentoCard span="lg:col-span-12 sm:col-span-6" label="Nothing generated yet">
          <p className="text-[12px] leading-relaxed text-muted">
            Paste notes above. Flashcards usually run on-device; the exam usually goes to the cloud. The badge after
            generation tells you which actually happened.
          </p>
        </BentoCard>
      ) : null}
    </div>
  );
}
