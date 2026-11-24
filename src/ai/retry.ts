/**
 * Capacity retry budget.
 *
 * The free tier is metered per minute and per model; measurement on the deployed app showed it
 * slotting in occasional requests at around twenty seconds, so a single 20 s retry often fires
 * before the next window opens. Two attempts — 20 s, then 45 s — landed a real answer that a
 * one-retry design had given up on.
 *
 * Shared by both pages so a throttled quiz is not treated differently from a throttled question.
 */

export const CAPACITY_RETRY_DELAYS_MS = [20_000, 45_000] as const;

export function isCapacityCode(code: string | undefined): boolean {
  return code === "QUOTA_EXCEEDED" || code === "MODEL_OVERLOADED";
}
