/// <reference types="vitest/config" />
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
  test: {
    // The routing policy, language detector and parsers are pure, so the suite
    // runs without a DOM or a Firebase project.
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
