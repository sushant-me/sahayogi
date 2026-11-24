/** App shell: brand, navigation, and the live device/connectivity status. */

import type { ReactNode } from "react";

import { useApp } from "../state/appContext";
import { Chip } from "./ui";

export type PageId = "ask" | "quiz" | "history" | "settings";

const NAV: Array<{ id: PageId; label: string }> = [
  { id: "ask", label: "Ask" },
  { id: "quiz", label: "Quiz" },
  { id: "history", label: "History" },
  { id: "settings", label: "Settings" },
];

const DEVICE_LABEL: Record<string, { text: string; tone: "device" | "warn" | "danger" | "cloud" }> = {
  available: { text: "Nano ready", tone: "device" },
  downloadable: { text: "Nano not downloaded", tone: "warn" },
  downloading: { text: "Nano downloading", tone: "warn" },
  unavailable: { text: "Nano unavailable", tone: "danger" },
  unsupported: { text: "no Prompt API", tone: "danger" },
};

export function Layout({
  page,
  onNavigate,
  children,
}: {
  page: PageId;
  onNavigate: (page: PageId) => void;
  children: ReactNode;
}) {
  const { online, deviceAvailability, deviceChecking, policySource } = useApp();
  const device = DEVICE_LABEL[deviceAvailability] ?? DEVICE_LABEL.unsupported;

  return (
    <div className="min-h-screen bg-bg text-ink">
      <header className="sticky top-0 z-40 border-b border-line bg-bg/85 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <span
              aria-hidden="true"
              className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-accent to-device text-[13px] font-bold text-bg"
            >
              S
            </span>
            <div className="leading-tight">
              <p className="text-[14px] font-semibold tracking-tight">Sahayogi</p>
              <p className="text-[11px] text-muted">hybrid study assistant</p>
            </div>
          </div>

          <nav className="order-3 flex w-full gap-1 sm:order-none sm:w-auto" aria-label="Sections">
            {NAV.map((item) => {
              const active = item.id === page;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onNavigate(item.id)}
                  aria-current={active ? "page" : undefined}
                  className={`rounded-md px-2.5 py-1.5 text-[12.5px] font-medium transition-colors ${
                    active ? "bg-panel-2 text-ink" : "text-muted hover:text-ink"
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <Chip tone={online ? "neutral" : "warn"} title={online ? "Connected" : "No network"}>
              {online ? "online" : "offline"}
            </Chip>
            <Chip tone={device.tone} title={`On-device capability: ${deviceAvailability}`}>
              {deviceChecking ? "checking" : device.text}
            </Chip>
            <Chip tone="neutral" title="Where the routing policy came from">
              policy: {policySource}
            </Chip>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>

      <footer className="mx-auto max-w-5xl px-4 pb-8 pt-2">
        <p className="text-[11.5px] leading-relaxed text-muted">
          Built for #BuildHybridAI 2026 with Firebase AI Logic hybrid inference — Gemini Nano on-device,
          cloud fallback through the same SDK. Every answer states where it ran.
        </p>
      </footer>
    </div>
  );
}
