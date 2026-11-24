/**
 * Setup screen.
 *
 * Rendered when the Firebase web config is absent. The app does not fabricate
 * answers or fake a connection: it tells you exactly which values are missing and
 * where they come from.
 */

import { Panel, SectionHeading } from "../components/ui";
import { useApp } from "../state/appContext";

const ENV_BLOCK = `# .env.local  (never commit this file)
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...

# App Check (AI Logic requires it). Use reCAPTCHA Enterprise site key,
# or set VITE_APP_CHECK_DEBUG=true with a registered debug token.
VITE_APP_CHECK_SITE_KEY=...
VITE_APP_CHECK_PROVIDER=enterprise
VITE_APP_CHECK_DEBUG=false
VITE_APP_CHECK_DEBUG_TOKEN=`;

const CONSOLE_STEPS = [
  "Create the Firebase project, then enable Authentication → Anonymous.",
  "Create Firestore in production mode (asia-south1 is closest to Nepal).",
  "Enable AI Logic and note which cloud model id your project exposes.",
  "Register the web app under App Check with a reCAPTCHA Enterprise site key; add localhost and the Hosting domain.",
  "Create the Remote Config parameter routing_policy (JSON) — the app falls back to defaults without it.",
];

export function SetupPage() {
  const { diagnostics } = useApp();

  return (
    <div className="min-h-screen bg-bg px-4 py-10 text-ink">
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-accent to-device text-[15px] font-bold text-bg"
          >
            S
          </span>
          <div>
            <h1 className="text-[18px] font-semibold tracking-tight">Sahayogi</h1>
            <p className="text-[12px] text-muted">hybrid study assistant · setup required</p>
          </div>
        </div>

        <Panel className="p-5">
          <SectionHeading
            title="Firebase is not configured yet"
            hint="This build has no project credentials, so AI Logic cannot be initialised. Nothing below is simulated — add the config and the full hybrid path turns on."
          />
          <p className="text-[12.5px] text-warn">
            Missing: {diagnostics.missing.join(", ") || "VITE_FIREBASE_* variables"}
          </p>
        </Panel>

        <Panel className="p-5">
          <SectionHeading title="1 · Environment" hint="Copy into .env.local at the project root, then restart the dev server." />
          <pre className="overflow-x-auto rounded-lg border border-line bg-panel-2/60 p-3 text-[11.5px] leading-relaxed text-ink">
{ENV_BLOCK}
          </pre>
        </Panel>

        <Panel className="p-5">
          <SectionHeading title="2 · Firebase console" hint="Order matters: Auth and Firestore before App Check, AI Logic before the first request." />
          <ol className="list-inside list-decimal space-y-1.5 text-[12.5px] leading-relaxed text-muted">
            {CONSOLE_STEPS.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </Panel>

        <Panel className="p-5">
          <SectionHeading
            title="3 · On-device model"
            hint="Chrome only. The weights are a separate download and are not guaranteed on every platform."
          />
          <ol className="list-inside list-decimal space-y-1.5 text-[12.5px] leading-relaxed text-muted">
            <li>Open chrome://flags and enable Prompt API for Gemini Nano.</li>
            <li>Enable “Optimization Guide On Device Model” and choose “Enabled BypassPerfRequirement” if the hardware check blocks it.</li>
            <li>Open chrome://components → “Optimization Guide On Device Model” → Check for update.</li>
            <li>Confirm with <code className="font-mono text-ink">await LanguageModel.availability()</code> returning “available”.</li>
          </ol>
          <p className="mt-3 text-[12px] leading-relaxed text-muted">
            Without the weights the app still works: the SDK falls back to the cloud and the badge reports
            ☁️ cloud with the reason “no device model”. That is the honest failure mode, not a broken screen.
          </p>
        </Panel>
      </div>
    </div>
  );
}
