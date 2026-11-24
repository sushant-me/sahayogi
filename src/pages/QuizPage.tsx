/**
 * Quiz — turn pasted notes into active-recall material.
 *
 * The two actions map onto the two halves of the hybrid story: flashcards are a
 * light task (policy prefers this device), a full practice exam is heavy (policy
 * prefers the cloud). Neither button promises a route; both report the one that
 * actually happened.
 */

import { useMemo, useState } from "react";

import { runInference } from "../ai/engine";
import type { AppError } from "../ai/errors";
import { detectScript } from "../ai/language";
import { parseFlashcards, splitMarkdownSections } from "../ai/parse";
import type { InferenceMode, InferenceSource, TaskKind } from "../ai/policy";
import { decideRoute } from "../ai/policy";
import type { Flashcard } from "../ai/prompts";
import { RouteBadge } from "../components/RouteBadge";
import { Button, Chip, EmptyState, Panel, SectionHeading } from "../components/ui";
import { useApp } from "../state/AppContext";
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
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState<TaskKind | null>(null);
  const [cards, setCards] = useState<Flashcard[] | null>(null);
  const [rawFallback, setRawFallback] = useState<string | null>(null);
  const [exam, setExam] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<Set<number>>(new Set());
  const [meta, setMeta] = useState<Meta | null>(null);

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
    <div className="space-y-4">
      <Panel className="p-5">
        <SectionHeading
          title="Notes in, recall out"
          hint="Paste lecture notes or a textbook paragraph. Flashcards are light enough to run on this device; a full practice exam prefers the cloud model."
        />

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

        {notes.trim() ? (
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-line bg-panel-2/50 px-3 py-2">
            <span className="text-[11.5px] text-muted">Predicted routes</span>
            <Chip tone={expected.flashcards.inferenceMode === "only_in_cloud" ? "cloud" : "device"}>
              flashcards → {expected.flashcards.inferenceMode === "only_in_cloud" ? "cloud" : "on-device"}
            </Chip>
            <Chip tone="cloud">
              exam → {expected.exam.inferenceMode === "only_in_cloud" || expected.exam.inferenceMode === "prefer_in_cloud" ? "cloud" : "on-device"}
            </Chip>
            {expected.exam.degraded ? <Chip tone="warn">offline: exam runs on-device with reduced quality</Chip> : null}
          </div>
        ) : null}
      </Panel>

      {meta ? (
        <div className="flex flex-wrap items-center gap-2 px-1">
          <span className="text-[11.5px] text-muted">Last generation</span>
          <RouteBadge predictedMode={meta.mode} actual={meta.actual} latencyMs={meta.latencyMs} />
          <span className="text-[11.5px] text-muted">{meta.reason}</span>
        </div>
      ) : null}

      {cards && cards.length > 0 ? (
        <Panel className="p-5">
          <SectionHeading title={`${cards.length} flashcards`} hint="Click a card to reveal the answer. Test yourself before flipping." />
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
        </Panel>
      ) : null}

      {rawFallback ? (
        <Panel className="p-5">
          <SectionHeading
            title="Model returned prose, not JSON"
            hint="On-device models do not always honour structured output. The raw answer is shown rather than discarded."
          />
          <pre className="whitespace-pre-wrap text-[13px] leading-relaxed text-ink">{rawFallback}</pre>
        </Panel>
      ) : null}

      {exam ? (
        <Panel className="p-5">
          <SectionHeading title="Practice exam" hint="Answer first, then check the key at the bottom." />
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
        </Panel>
      ) : null}

      {!cards && !exam && !rawFallback && busy === null ? (
        <EmptyState
          title="No material generated yet"
          body="Paste notes above. Flashcards usually run on-device; the exam usually goes to the cloud. The badge after generation tells you which actually happened."
        />
      ) : null}
    </div>
  );
}
