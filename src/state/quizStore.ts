/**
 * The last generated study material.
 *
 * An exam takes roughly a minute to generate, so losing it to an accidental refresh is
 * the most expensive thing this app can do to a user. The result is kept locally (never
 * synced) and restored on load, together with the routing evidence that produced it —
 * that evidence is part of the result, not decoration.
 */

import type { Flashcard } from "../ai/prompts";
import type { InferenceMode, InferenceSource, RouteReason, TaskKind } from "../ai/policy";

const KEY = "sahayogi.quiz.result";

export interface QuizMeta {
  mode: InferenceMode;
  actual: InferenceSource | null;
  reason: RouteReason;
  latencyMs: number;
}

export interface QuizSnapshot {
  task: TaskKind;
  cards: Flashcard[] | null;
  exam: string | null;
  rawFallback: string | null;
  meta: QuizMeta | null;
  at: number;
}

function available(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function readQuizSnapshot(): QuizSnapshot | null {
  if (!available()) return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as QuizSnapshot;
    // Guard against a shape from an older build rather than crashing the page.
    if (!parsed || typeof parsed !== "object" || !parsed.task) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeQuizSnapshot(snapshot: Omit<QuizSnapshot, "at">): void {
  if (!available()) return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ ...snapshot, at: Date.now() }));
  } catch {
    /* quota or private mode: losing the restore is better than breaking generation */
  }
}

export function clearQuizSnapshot(): void {
  if (!available()) return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
