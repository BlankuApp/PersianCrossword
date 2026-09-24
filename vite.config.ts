import legacy from "@vitejs/plugin-legacy";
import react from "@vitejs/plugin-react";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  base: "./",
  server: {
    port: 5567,
  },
  plugins: [
    react(),
    // Old phones keep their factory WebView (no Play Store updates); 55 is Capacitor's own floor.
    legacy({ targets: ["chrome >= 55"], modernPolyfills: true }),
  ],
  build: {
    outDir: "app-dist",
    cssTarget: "chrome55",
  },
  test: {
    environment: "node",
    setupFiles: ["./test/setup.ts"],
    exclude: [...configDefaults.exclude, "functions/**"],
  },
});
