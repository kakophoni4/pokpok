import { fileURLToPath } from "node:url";
import tailwind from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  // The monorepo keeps a single .env at the root.
  envDir: fileURLToPath(new URL("../..", import.meta.url)),

  plugins: [
    react(),
    tailwind(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "apple-touch-icon.png"],
      manifest: {
        name: "Клуб спортивного покера",
        short_name: "Покер клуб",
        description:
          "Расписание игр, запись на турниры, личный рейтинг и достижения клуба спортивного покера",
        lang: "ru",
        start_url: "/",
        scope: "/",
        // standalone is what makes the iOS home-screen icon open without Safari chrome.
        display: "standalone",
        orientation: "portrait",
        background_color: "#0b1210",
        theme_color: "#0b1210",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "/icons/icon-512-maskable.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        // API responses must never be served from the cache: a stale schedule is
        // worse than a spinner.
        navigateFallbackDenylist: [/^\/api/],
        runtimeCaching: [
          {
            urlPattern: /^\/api\//,
            handler: "NetworkOnly",
          },
        ],
      },
    }),
  ],

  server: {
    port: 5173,
    // Same-origin API in development, so the httpOnly refresh cookie behaves
    // exactly as it will behind the production reverse proxy.
    proxy: {
      "/api": {
        // 127.0.0.1 rather than localhost: on Windows the latter resolves to
        // IPv6 first, which silently fails when the API binds IPv4 only.
        target: process.env.PUBLIC_API_URL ?? "http://127.0.0.1:3000",
        changeOrigin: false,
      },
    },
  },

  build: {
    outDir: "dist",
    sourcemap: true,
  },
});
