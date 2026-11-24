/**
 * The self-check card: one button, and the wiring proves itself in the browser.
 *
 * Results are shown as they are — a warn is still a warn, and a failure keeps its raw
 * message rather than being smoothed into something friendlier.
 */

import { useState } from "react";

import { runInference } from "../ai/engine";
import type { AppError } from "../ai/errors";
import { runSelfCheck, type CheckResult } from "../lib/selfCheck";
import { useApp } from "../state/appContext";
import { BentoCard } from "./bento";
import { Button, Chip } from "./ui";

const TONE: Record<CheckResult["status"], { chip: "device" | "warn" | "danger"; word: string }> = {
  pass: { chip: "device", word: "pass" },
  warn: { chip: "warn", word: "warn" },
  fail: { chip: "danger", word: "fail" },
};

export function SelfCheck() {
  const { online, deviceAvailability, policySource, policy, userMode } = useApp();
  const [results, setResults] = useState<CheckResult[] | null>(null);
  const [running, setRunning] = useState(false);
  const [probe, setProbe] = useState<CheckResult | null>(null);
  const [probing, setProbing] = useState(false);

  /**
   * The checks above prove the wiring without spending quota — which also means they can
   * pass while inference itself is rate-limited. This optional probe answers that question
   * directly, and is labelled so nobody triggers it by accident.
   */
  async function testModel() {
    setProbing(true);
    setProbe(null);
    try {
      const result = await runInference({
        text: "Reply with the single word: ready",
        taskKind: "chat",
        userMode,
        policy,
        availability: deviceAvailability,
        online,
      });
      setProbe({
        id: "probe",
        label: "One real answer",
        status: "pass",
        detail: `answered via ${result.actual ?? "unknown"} in ${result.latencyMs} ms (${result.modelUsed ?? "on-device"})`,
      });
    } catch (error) {
      const appErr = error as AppError;
      setProbe({
        id: "probe",
        label: "One real answer",
        status: "fail",
        detail: `${appErr.code ?? "UNKNOWN"}: ${appErr.message}`.slice(0, 200),
      });
    } finally {
      setProbing(false);
    }
  }

  async function run() {
    setRunning(true);
    try {
      setResults(await runSelfCheck({ online, deviceAvailability, policySource }));
    } finally {
      setRunning(false);
    }
  }

  const failed = results?.filter((entry) => entry.status === "fail").length ?? 0;
  const warned = results?.filter((entry) => entry.status === "warn").length ?? 0;

  return (
    <BentoCard
      span="lg:col-span-12 sm:col-span-6"
      label="Self-check"
      accent={results ? (failed ? "danger" : warned ? "warn" : "device") : "neutral"}
      meta={
        results ? (
          <Chip tone={failed ? "danger" : warned ? "warn" : "device"}>
            {failed ? `${failed} failed` : warned ? `${warned} warning${warned > 1 ? "s" : ""}` : "all clear"}
          </Chip>
        ) : (
          <span>not run</span>
        )
      }
    >
      <p className="mb-3 max-w-3xl text-[12px] leading-relaxed text-muted">
        Runs the same readiness checks the project verifies from the terminal, but here in your browser and against
        the real SDK: config, identity, App Check attestation, a Firestore write → read → delete round-trip, Remote
        Config, and the on-device model. It deliberately does not call the model — that would spend quota to prove a
        point.
      </p>

      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => void run()} disabled={running}>
          {running ? "Checking…" : results ? "Run again" : "Run self-check"}
        </Button>
        <Button
          variant="ghost"
          onClick={() => void testModel()}
          disabled={probing}
          title="Sends one tiny prompt and reports what came back — this uses a little of the free quota"
        >
          {probing ? "Asking the model…" : "Test one answer (uses a little quota)"}
        </Button>
      </div>

      {probe ? (
        <p className="mt-2 flex flex-wrap items-baseline gap-2 text-[12px]">
          <Chip tone={probe.status === "pass" ? "device" : "danger"}>
            {probe.status === "pass" ? "pass" : "fail"}
          </Chip>
          <span className="font-medium text-ink">{probe.label}</span>
          <span className="min-w-0 flex-1 break-words text-muted">{probe.detail}</span>
        </p>
      ) : null}

      {results ? (
        <ul className="mt-3 divide-y divide-line/60 border-t border-line/60">
          {results.map((result) => (
            <li key={result.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-1.5">
              <Chip tone={TONE[result.status].chip}>{TONE[result.status].word}</Chip>
              <span className="w-36 shrink-0 text-[12px] font-medium text-ink">{result.label}</span>
              <span className="min-w-0 flex-1 break-words text-[11.5px] leading-relaxed text-muted">
                {result.detail}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </BentoCard>
  );
}
