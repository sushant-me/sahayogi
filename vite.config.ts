import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import { VitePWA } from "vite-plugin-pwa";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // The app's central claim is that it keeps working without a network. A
    // service worker is what makes that true after a reload, not just while the
    // tab happens to be open. It precaches same-origin assets only: Firebase
    // traffic is cross-origin and is never cached here.
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "icons/*.png"],
      devOptions: { enabled: false },
      manifest: {
        name: "Sahayogi — hybrid study assistant",
        short_name: "Sahayogi",
        description:
          "Light study prompts run on-device with Gemini Nano; heavy ones use the cloud through Firebase AI Logic hybrid inference. Every answer states where it ran.",
        theme_color: "#0b0d10",
        background_color: "#0b0d10",
        display: "standalone",
        start_url: "/",
        scope: "/",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "/icons/maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/__/],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
      },
    }),
  ],
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
