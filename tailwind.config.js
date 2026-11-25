/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // One step lifted from the previous near-black, so cards separate by tone rather
        // than by drawn lines.
        bg: "#0f0f16",
        panel: "#161620",
        "panel-2": "#1d1d29",
        // Barely-there separation: borders are a hint, not a grid.
        line: "rgba(255,255,255,0.07)",
        ink: "#eef0f6",
        muted: "#9598a9",
        accent: "#8b5cf6",
        // Semantic system, used everywhere and only for these meanings:
        //   device = emerald (on-device) · cloud = violet (in the cloud) · warn = amber
        device: "#34d399",
        "device-deep": "#10b981",
        cloud: "#a78bfa",
        "cloud-deep": "#8b5cf6",
        warn: "#fbbf24",
        danger: "#fb7185",
      },
      fontFamily: {
        display: ["Space Grotesk", "Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        sans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
      },
    },
  },
  plugins: [],
};
