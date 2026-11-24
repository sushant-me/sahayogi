/**
 * Device preflight.
 *
 * Chrome only allows a download-triggering session creation from a real user
 * gesture, so the model is prepared here, behind an explicit button, and never on
 * page load. That single constraint is why this component exists.
 */

import { useApp } from "../state/appContext";
import { BentoCard } from "./bento";
import { Button, Chip } from "./ui";

const AVAILABILITY_COPY: Record<string, { label: string; tone: "neutral" | "device" | "warn" | "cloud" | "danger"; body: string }> = {
  available: {
    label: "ready",
    tone: "device",
    body: "Gemini Nano is installed and ready. Auto mode will keep light prompts on this device.",
  },
  downloadable: {
    label: "not downloaded",
    tone: "warn",
    body: "This browser can run Gemini Nano, but the model is not on disk yet. Download it while online to use offline mode.",
  },
  downloading: {
    label: "downloading",
    tone: "warn",
    body: "The on-device model is downloading. Keep this tab open until it finishes.",
  },
  unavailable: {
    label: "unavailable",
    tone: "danger",
    body: "Chrome reports the on-device model is unavailable on this machine. Inference will use the cloud.",
  },
  unsupported: {
    label: "not supported",
    tone: "danger",
    body: "This browser does not expose the Prompt API. Use a recent Chrome build to run inference on-device.",
  },
};

export function DevicePreflight() {
  const { deviceAvailability, deviceChecking, preflight, startPreflight, refreshDevice } = useApp();
  const copy = AVAILABILITY_COPY[deviceAvailability] ?? AVAILABILITY_COPY.unsupported;
  const canDownload = deviceAvailability === "downloadable" || deviceAvailability === "downloading";
  const percent = preflight.progress !== null ? Math.round(preflight.progress * 100) : null;

  return (
    <BentoCard
      span=""
      label="On-device model"
      accent={copy.tone === "device" ? "device" : copy.tone === "warn" ? "warn" : "danger"}
      meta={<Chip tone={copy.tone}>{deviceChecking ? "checking" : copy.label}</Chip>}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-medium text-ink">On-device model</span>
          <Chip tone={copy.tone}>{deviceChecking ? "checking" : copy.label}</Chip>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            onClick={() => void refreshDevice()}
            disabled={deviceChecking}
            aria-label="Re-check on-device availability"
          >
            Re-check
          </Button>
          <Button
            variant="primary"
            onClick={() => void startPreflight()}
            disabled={preflight.running || !canDownload}
            title={
              canDownload
                ? "Downloads the on-device model and warms a session"
                : "The model is either ready or cannot run on this browser"
            }
          >
            {preflight.running ? "Preparing…" : "Enable offline mode"}
          </Button>
        </div>
      </div>

      <p className="mt-1 text-[12px] leading-relaxed text-muted">{copy.body}</p>

      {preflight.running ? (
        <div className="mt-3">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-line">
            <div
              className="h-full rounded-full bg-accent transition-[width] duration-300"
              style={{ width: `${percent ?? 8}%` }}
            />
          </div>
          <p className="mt-1.5 text-[12px] text-muted">
            {percent !== null ? `Downloading ${percent}%` : "Waiting for Chrome to start the download…"}
          </p>
        </div>
      ) : null}

      {preflight.message && !preflight.running ? (
        <p className="mt-2 text-[12px] text-muted">{preflight.message}</p>
      ) : null}
    </BentoCard>
  );
}
