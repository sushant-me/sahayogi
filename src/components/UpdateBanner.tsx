/**
 * "A newer version is available" banner.
 *
 * The service worker is registered with `registerType: "prompt"` rather than
 * `autoUpdate`, because autoUpdate leaves an already-open tab running the previous build
 * with no indication — which is genuinely confusing during a demo: a fix looks like it
 * did not deploy. The banner makes the swap explicit and one click away.
 */

import { useRegisterSW } from "virtual:pwa-register/react";

export function UpdateBanner() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  if (!needRefresh) return null;

  return (
    <div
      role="status"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-line bg-panel px-4 py-3 shadow-lg"
    >
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3">
        <p className="text-[12.5px] leading-relaxed text-ink">
          A newer version of Sahayogi is available. Reload to get it — the current tab is still running the previous
          build.
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void updateServiceWorker(true)}
            className="rounded-md bg-accent px-3 py-1.5 text-[12px] font-medium text-bg transition-opacity hover:opacity-90"
          >
            Reload
          </button>
          <button
            type="button"
            onClick={() => setNeedRefresh(false)}
            className="rounded-md border border-line px-3 py-1.5 text-[12px] text-muted transition-colors hover:text-ink"
          >
            Later
          </button>
        </div>
      </div>
    </div>
  );
}
