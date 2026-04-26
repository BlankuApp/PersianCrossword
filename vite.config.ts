import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  base: "./",
  plugins: [react()],
  build: {
    outDir: "app-dist",
  },
  test: {
    environment: "node",
    setupFiles: ["./test/setup.ts"],
  },
});
