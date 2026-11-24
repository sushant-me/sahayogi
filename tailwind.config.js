/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0b0d10",
        panel: "#10141a",
        "panel-2": "#151b23",
        line: "#232b36",
        ink: "#e7eaf0",
        muted: "#8b96a5",
        accent: "#6ea8ff",
        device: "#3fb950",
        cloud: "#58a6ff",
        warn: "#d29922",
        danger: "#f85149",
      },
      fontFamily: {
        sans: [
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
