/**
 * Settings — where the system explains itself.
 *
 * Device capability, the active routing policy (and where it came from), the
 * routing ledger, and the Firebase connection state. This is the page a judge
 * opens to check whether the claims are real.
 */

import { DevicePreflight } from "../components/DevicePreflight";
import { ModeToggle } from "../components/ModeToggle";
import { SelfCheck } from "../components/SelfCheck";
import { TransparencyPanel } from "../components/TransparencyPanel";
import { BentoCard, BentoGrid, BentoMetric, BentoRow } from "../components/bento";
import { Button, Chip } from "../components/ui";
import { useApp } from "../state/appContext";
import { clearRoutingLog, downloadRoutingLog, summariseLog, useRoutingLog } from "../state/routingLog";

export function SettingsPage() {
  const { userMode, setUserMode, policy, policySource, policyIssues, diagnostics, uid, deviceAvailability } = useApp();
  const log = useRoutingLog();
  const summary = summariseLog(log);

  return (
    <BentoGrid>
      <BentoCard
        span="lg:col-span-5 sm:col-span-6"
        label="Inference mode"
        accent="cloud"
        meta={<Chip tone="neutral">{userMode}</Chip>}
      >
        <p className="mb-3 text-[12px] leading-relaxed text-muted">
          Auto follows the routing policy. On-device and Cloud are explicit overrides — honoured even when they make the
          request fail, because a silent override would make the badge meaningless.
        </p>
        <ModeToggle value={userMode} onChange={setUserMode} />
      </BentoCard>

      <BentoCard
        span="lg:col-span-7 sm:col-span-6"
        label="Routing ledger"
        meta={<span>{summary.total} decisions</span>}
      >
        <div className="mb-3 grid grid-cols-2 gap-4">
          <div>
            <BentoMetric value={summary.onDevice} unit="on-device" tone="text-device" />
          </div>
          <div>
            <BentoMetric value={summary.cloud} unit="cloud" tone="text-cloud" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-x-5">
          <BentoRow k="prediction missed">{summary.disagreements}</BentoRow>
          <BentoRow k="avg latency">{summary.avgLatency !== null ? `${summary.avgLatency} ms` : "—"}</BentoRow>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => downloadRoutingLog(log)} disabled={log.length === 0}>
            Export routing log (JSON)
          </Button>
          <Button variant="ghost" onClick={clearRoutingLog} disabled={log.length === 0}>
            Clear ({log.length})
          </Button>
        </div>
      </BentoCard>

      <SelfCheck />

      <div className="sm:col-span-6 lg:col-span-5">
        <DevicePreflight />
      </div>

      <BentoCard span="lg:col-span-7 sm:col-span-6" label="Firebase connection" accent="device">
        <BentoRow k="project">{diagnostics.projectId ?? "not configured"}</BentoRow>
        <BentoRow k="App Check">{diagnostics.appCheck}</BentoRow>
        <BentoRow k="anonymous uid">
          <span className="font-mono">{uid ? `${uid.slice(0, 10)}…` : "none"}</span>
        </BentoRow>
        <BentoRow k="on-device">{deviceAvailability}</BentoRow>
        {diagnostics.missing.length > 0 ? (
          <p className="mt-2 text-[11.5px] text-warn">Missing: {diagnostics.missing.join(", ")}</p>
        ) : null}
      </BentoCard>

      <div className="sm:col-span-6 lg:col-span-12">
        <TransparencyPanel />
      </div>

      <BentoCard
        span="lg:col-span-7 sm:col-span-6"
        label="Routing policy"
        meta={<Chip tone={policySource === "remote" ? "device" : "neutral"}>source: {policySource}</Chip>}
      >
        <p className="mb-3 text-[12px] leading-relaxed text-muted">
          Fetched from Remote Config on boot with a hard-coded fallback, so the app never blocks on a network
          round-trip. Edit <span className="font-mono text-ink">routing_policy</span> in the console and reload to
          change routing without a deploy.
        </p>
        <pre className="max-h-64 overflow-auto rounded-lg border border-line bg-bg/60 p-3 text-[11.5px] leading-relaxed text-ink">
{JSON.stringify(policy, null, 2)}
        </pre>
        {policyIssues.length > 0 ? (
          <ul className="mt-3 space-y-1">
            {policyIssues.map((issue) => (
              <li key={issue} className="text-[11.5px] text-warn">
                • {issue}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-[11.5px] text-muted">Policy parsed without issues.</p>
        )}
      </BentoCard>

      <BentoCard span="lg:col-span-5 sm:col-span-6" label="How to verify this yourself">
        <ol className="list-inside list-decimal space-y-1.5 text-[11.5px] leading-relaxed text-muted">
          <li>Open in Chrome with the on-device model installed (README records the build and flags).</li>
          <li>Click “Enable offline mode”; the model downloads and reports ready.</li>
          <li>Ask a short English question, disable networking, ask again — the badge stays ⚡.</li>
          <li>Ask a Nepali question — the badge switches to ☁️ with the language reason.</li>
          <li>Open Transparency: predicted and actual per row, with latency.</li>
          <li>Change routing_policy in Remote Config, reload, watch behaviour change.</li>
        </ol>
        <p className="mt-3 text-[11px] leading-relaxed text-muted">
          The exported JSON is the evidence file: one row per decision with the requested mode, the SDK's reported
          source, latency, and whether they agreed.
        </p>
      </BentoCard>
    </BentoGrid>
  );
}
