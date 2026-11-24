/** Mode toggle: Auto / On-device / Cloud, with the consequence of each stated. */

import type { UserMode } from "../ai/policy";

const OPTIONS: Array<{ id: UserMode; label: string; note: string }> = [
  { id: "auto", label: "Auto", note: "Route each prompt by policy" },
  { id: "on-device", label: "On-device", note: "Never leave the machine" },
  { id: "cloud", label: "Cloud", note: "Always the larger model" },
];

export function ModeToggle({
  value,
  onChange,
  disabled = false,
}: {
  value: UserMode;
  onChange: (mode: UserMode) => void;
  disabled?: boolean;
}) {
  return (
    <div
      className="inline-flex rounded-lg border border-line bg-panel-2 p-0.5"
      role="group"
      aria-label="Inference mode"
    >
      {OPTIONS.map((option) => {
        const active = option.id === value;
        return (
          <button
            key={option.id}
            type="button"
            disabled={disabled}
            onClick={() => onChange(option.id)}
            title={option.note}
            aria-pressed={active}
            className={`rounded-[6px] px-3 py-1.5 text-[12.5px] font-medium transition-colors ${
              active
                ? "bg-accent/15 text-accent ring-1 ring-inset ring-accent/35"
                : "text-muted hover:text-ink"
            } ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
