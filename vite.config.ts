import legacy from "@vitejs/plugin-legacy";
import react from "@vitejs/plugin-react";
import { writeFileSync } from "fs";
import { resolve } from "path";
import { configDefaults, defineConfig } from "vitest/config";
import { readPuzzleFiles } from "./scripts/puzzleFiles.ts";

// `virtual:puzzle-hashes` → { "puzzles/1-50/14.json": hash } for the puzzles bundled into the
// app, so it can tell which cloud catalog entries (scripts/uploadPuzzles.ts) differ from them.
function puzzleHashesPlugin() {
  const virtualId = "virtual:puzzle-hashes";
  const resolvedId = "\0" + virtualId;
  let root = process.cwd();
  return {
    name: "puzzle-hashes",
    configResolved(config: { root: string }) {
      root = config.root;
    },
    resolveId(id: string) {
      return id === virtualId ? resolvedId : undefined;
    },
    load(id: string) {
      if (id !== resolvedId) return undefined;
      const hashes = Object.fromEntries(readPuzzleFiles(root).map((p) => [p.relPath, p.hash]));
      return `export default ${JSON.stringify(hashes)};`;
    },
    configureServer(server: { watcher: { on: (event: string, fn: (path: string) => void) => void }; moduleGraph: { getModuleById: (id: string) => unknown; invalidateModule: (mod: never) => void } }) {
      // Debug saves rewrite puzzle files; recompute on the next load.
      server.watcher.on("change", (path) => {
        if (!resolve(path).startsWith(resolve(root, "puzzles"))) return;
        const mod = server.moduleGraph.getModuleById(resolvedId);
        if (mod) server.moduleGraph.invalidateModule(mod as never);
      });
    },
  };
}

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
  plugins: [
    devPuzzleSaverPlugin(),
    puzzleHashesPlugin(),
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
