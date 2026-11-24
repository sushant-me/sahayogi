/** Connectivity banner. Offline is a supported state here, not an error. */

import type { DeviceAvailability } from "../ai/policy";
import { Chip } from "./ui";

export function OfflineBanner({ availability }: { availability: DeviceAvailability }) {
  const deviceReady = availability === "available";
  const pending = availability === "downloadable" || availability === "downloading";

  return (
    <div className="flex flex-wrap items-start gap-3 rounded-xl border border-warn/30 bg-warn/[0.07] px-4 py-3">
      <span aria-hidden="true" className="text-[15px] leading-6">
        📴
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium text-warn">You are offline</p>
        <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted">
          {deviceReady
            ? "Light prompts still run on this device. Anything that needs the cloud is queued until you reconnect."
            : pending
              ? "The on-device model is not ready yet, so new prompts cannot run. Reconnect to download it, or use history which is available offline."
              : "No on-device model is available on this browser, so new prompts need a connection. Your history stays readable."}
        </p>
      </div>
      <Chip tone={deviceReady ? "device" : "warn"}>
        {deviceReady ? "on-device ready" : pending ? "model pending" : "cloud only"}
      </Chip>
    </div>
  );
}
