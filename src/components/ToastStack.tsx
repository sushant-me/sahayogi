/** Toast stack. Errors carry an actionable hint; hints never get truncated away. */

import { useApp } from "../state/appContext";

const TONE = {
  error: "border-danger/40 bg-danger/[0.08] text-danger",
  info: "border-accent/40 bg-accent/[0.08] text-accent",
  success: "border-device/40 bg-device/[0.08] text-device",
} as const;

export function ToastStack() {
  const { toasts, dismissToast } = useApp();
  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role="status"
          className={`pointer-events-auto flex w-full max-w-xl items-start gap-3 rounded-xl border px-4 py-3 shadow-lg backdrop-blur ${TONE[toast.kind]}`}
        >
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-medium">{toast.message}</p>
            {toast.hint ? <p className="mt-0.5 text-[12px] leading-relaxed text-muted">{toast.hint}</p> : null}
          </div>
          <button
            type="button"
            onClick={() => dismissToast(toast.id)}
            className="rounded p-1 text-muted hover:text-ink"
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
