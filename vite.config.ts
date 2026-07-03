import react from "@vitejs/plugin-react";
import { writeFileSync } from "fs";
import { resolve } from "path";
import { defineConfig } from "vitest/config";

function devPuzzleSaverPlugin() {
  return {
    name: "dev-puzzle-saver",
    configureServer(server: { config: { root: string }; middlewares: { use: (path: string, fn: (req: any, res: any, next: () => void) => void) => void } }) {
      server.middlewares.use("/dev/save-puzzle", (req, res, next) => {
        if (req.method !== "POST") { next(); return; }
        let body = "";
        req.on("data", (c: Buffer) => { body += c; });
        req.on("end", () => {
          try {
            const { filePath, json } = JSON.parse(body) as { filePath: string; json: unknown };
            const root = server.config.root;
            const abs = resolve(root, "app", filePath);
            const puzzlesDir = resolve(root, "puzzles");
            if (!abs.startsWith(puzzlesDir)) { res.writeHead(403); res.end("Forbidden"); return; }
            writeFileSync(abs, JSON.stringify(json, null, 2) + "\n");
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end('{"ok":true}');
          } catch (e) {
            res.writeHead(500); res.end(String(e));
          }
        });
      });
    },
  };
}

export default defineConfig({
  base: "./",
  server: {
    port: 5567,
  },
  plugins: [devPuzzleSaverPlugin(), react()],
  build: {
    outDir: "app-dist",
  },
  test: {
    environment: "node",
    setupFiles: ["./test/setup.ts"],
  },
});
