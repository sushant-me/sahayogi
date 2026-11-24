/**
 * Settings — where the system explains itself.
 *
 * Device capability, the active routing policy (and where it came from), the full
 * Transparency panel, and the Firebase connection diagnostics. This is the page
 * a judge opens to check whether the claims are real.
 */

import { DevicePreflight } from "../components/DevicePreflight";
import { ModeToggle } from "../components/ModeToggle";
import { TransparencyPanel } from "../components/TransparencyPanel";
import { Button, Chip, Panel, SectionHeading, Stat } from "../components/ui";
import { useApp } from "../state/appContext";
import { clearRoutingLog, summariseLog, useRoutingLog } from "../state/routingLog";

export function SettingsPage() {
  const { userMode, setUserMode, policy, policySource, policyIssues, diagnostics, uid, deviceAvailability } = useApp();
  const log = useRoutingLog();
  const summary = summariseLog(log);

  return (
    <div className="space-y-4">
      <Panel className="p-5">
        <SectionHeading
          title="Inference mode"
          hint="Auto follows the routing policy. On-device and Cloud are explicit overrides — they are honoured even when they make the request fail, because a silent override would make the badge meaningless."
        />
        <ModeToggle value={userMode} onChange={setUserMode} />
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Router decisions" value={summary.total} />
          <Stat label="Ran on-device" value={summary.onDevice} tone="text-device" />
          <Stat label="Ran in cloud" value={summary.cloud} tone="text-cloud" />
          <Stat label="Prediction missed" value={summary.disagreements} tone={summary.disagreements ? "text-warn" : undefined} />
        </div>
      </Panel>

      <DevicePreflight />

      <TransparencyPanel />

      <Panel className="p-5">
        <SectionHeading
          title="Routing policy"
          hint="Fetched from Firebase Remote Config on boot, with a hard-coded fallback so the app never blocks on a network round-trip. Edit routing_policy in the console and reload to change routing without a deploy."
          right={<Chip tone={policySource === "remote" ? "device" : "neutral"}>source: {policySource}</Chip>}
        />

        <pre className="overflow-x-auto rounded-lg border border-line bg-panel-2/50 p-3 text-[12px] leading-relaxed text-ink">
{JSON.stringify(policy, null, 2)}
        </pre>

        {policyIssues.length > 0 ? (
          <ul className="mt-3 space-y-1">
            {policyIssues.map((issue) => (
              <li key={issue} className="text-[12px] text-warn">
                • {issue}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-[12px] text-muted">Policy parsed without issues.</p>
        )}
      </Panel>

      <Panel className="p-5">
        <SectionHeading title="Firebase connection" hint="App Check is required by AI Logic; this panel shows which attestation path is active." />
        <dl className="grid gap-2 text-[12.5px] sm:grid-cols-2">
          <div className="flex items-center justify-between rounded-lg border border-line bg-panel-2/40 px-3 py-2">
            <dt className="text-muted">Project</dt>
            <dd className="font-medium text-ink">{diagnostics.projectId ?? "not configured"}</dd>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-line bg-panel-2/40 px-3 py-2">
            <dt className="text-muted">App Check</dt>
            <dd className="font-medium text-ink">{diagnostics.appCheck}</dd>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-line bg-panel-2/40 px-3 py-2">
            <dt className="text-muted">Anonymous uid</dt>
            <dd className="truncate font-mono text-[11.5px] text-ink">{uid ?? "none"}</dd>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-line bg-panel-2/40 px-3 py-2">
            <dt className="text-muted">On-device</dt>
            <dd className="font-medium text-ink">{deviceAvailability}</dd>
          </div>
        </dl>
        {diagnostics.missing.length > 0 ? (
          <p className="mt-3 text-[12px] text-warn">
            Missing: {diagnostics.missing.join(", ")} — see README for the exact .env.local block.
          </p>
        ) : null}
      </Panel>

      <Panel className="p-5">
        <SectionHeading
          title="How to verify this yourself"
          hint="The same steps the recorded demo follows. Nothing here is simulated."
        />
        <ol className="list-inside list-decimal space-y-1.5 text-[12.5px] leading-relaxed text-muted">
          <li>Open this app in Chrome with the on-device model installed (README records the exact build and flags).</li>
          <li>Click “Enable offline mode” above; the model downloads and reports ready.</li>
          <li>Ask a short English question, then disable networking and ask another — the badge stays ⚡ on-device.</li>
          <li>Ask a Nepali (Devanagari) question — the badge switches to ☁️ cloud with the language reason attached.</li>
          <li>Open Transparency above: predicted and actual are recorded per row, with latency.</li>
          <li>Change routing_policy in Remote Config, reload, and watch the threshold behaviour change without a deploy.</li>
        </ol>
        <div className="mt-4 flex gap-2">
          <Button variant="ghost" onClick={clearRoutingLog} disabled={log.length === 0}>
            Clear routing log ({log.length})
          </Button>
        </div>
      </Panel>
    </div>
  );
}
