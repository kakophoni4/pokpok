import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

/**
 * Component tests run against a jsdom DOM with the network stubbed, so they
 * cover the parts an API-level smoke test cannot: what the player actually sees
 * and what happens when they click.
 */
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    // Tailwind is not loaded here; these tests assert behaviour, not pixels.
    css: false,
  },
});
