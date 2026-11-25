/** App shell: brand, navigation, and the live device/connectivity status. */

import { useEffect, useRef, type ReactNode } from "react";

import { useApp } from "../state/appContext";
import { Logo } from "./Logo";

export type PageId = "ask" | "quiz" | "history" | "settings";

const NAV: Array<{ id: PageId; label: string }> = [
  { id: "ask", label: "Ask" },
  { id: "quiz", label: "Quiz" },
  { id: "history", label: "History" },
  { id: "settings", label: "Settings" },
];

const REPO = "https://github.com/sushant-me/sahayogi";

const DOCS = {
  architecture: `${REPO}/blob/main/docs/architecture.md`,
  verification: `${REPO}/blob/main/docs/verification.md`,
  browserSupport: `${REPO}/blob/main/docs/browser-support.md`,
  source: REPO,
};

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
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const label = NAV.find((entry) => entry.id === page)?.label ?? "Sahayogi";

  // A single-page app that silently swaps the view leaves assistive tech with no
  // announcement. Move focus to the page heading and update the tab title, the same way a
  // real navigation would — but only after the first render, so the initial load keeps the
  // browser's own focus behaviour.
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      document.title = `${label} — Sahayogi hybrid study assistant`;
      return;
    }
    document.title = `${label} — Sahayogi hybrid study assistant`;
    headingRef.current?.focus();
  }, [label]);

  return (
    <div className="min-h-screen bg-bg text-ink">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-accent focus:px-3 focus:py-2 focus:text-[13px] focus:font-medium focus:text-bg"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-40 border-b border-line bg-bg/85 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <Logo />
            <div className="leading-tight">
              <p className="font-display text-[15px] font-bold tracking-tight">Sahayogi</p>
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

          <div className="ml-auto">
            <span
              className="inline-flex items-center gap-2 rounded-full border border-line bg-panel px-3 py-1.5 text-[11.5px] text-ink"
              title={`Connection: ${online ? "online" : "offline"} · On-device: ${device.text} · Routing policy: ${policySource}`}
            >
              <span
                aria-hidden="true"
                className={`h-1.5 w-1.5 rounded-full ${online ? "bg-device shadow-[0_0_8px] shadow-device/60" : "bg-warn"}`}
              />
              {deviceChecking ? "checking" : online ? "online" : "offline"}
            </span>
          </div>
        </div>
      </header>

      <main id="main" className="mx-auto max-w-5xl px-4 py-6">
        {/*
          One h1 per page, for document structure and screen-reader navigation. The
          visual design labels each tile instead of shouting a page title, so the
          heading is present for assistive tech and visually hidden.
        */}
        <h1 ref={headingRef} tabIndex={-1} className="sr-only focus:outline-none">
          {label + " — Sahayogi hybrid study assistant"}
        </h1>
        {children}
      </main>

      <footer className="mx-auto max-w-5xl px-4 pb-8 pt-2">
        <p className="text-[11.5px] leading-relaxed text-muted">
          Built for #BuildHybridAI 2026 with Firebase AI Logic hybrid inference — Gemini Nano on-device,
          cloud fallback through the same SDK. Every answer states where it ran.
        </p>
        {/* A judge reading the live app should be able to reach the evidence without
            going back to the submission page. */}
        <nav aria-label="Documentation" className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px]">
          <a className="text-accent hover:underline" href={DOCS.architecture}>Architecture</a>
          <a className="text-accent hover:underline" href={DOCS.verification}>Verification log</a>
          <a className="text-accent hover:underline" href={DOCS.browserSupport}>Browser support</a>
          <a className="text-accent hover:underline" href={DOCS.source}>Source</a>
          <button
            type="button"
            className="text-accent hover:underline"
            onClick={() => onNavigate("settings")}
          >
            Self-check
          </button>
        </nav>
      </footer>
    </div>
  );
}
