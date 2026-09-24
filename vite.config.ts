import legacy from "@vitejs/plugin-legacy";
import react from "@vitejs/plugin-react";
import { writeFileSync } from "fs";
import { basename, relative, resolve, sep } from "path";
import { configDefaults, defineConfig } from "vitest/config";
import { readPuzzleFiles } from "./scripts/puzzleFiles.ts";

// Dev server only: serves the local puzzles/ folder (kept out of git) as the app's puzzle list,
// so debug mode can edit and save the files. Production builds contain no puzzles; they
// download them from Firebase (app/puzzleSync.ts).
function devLocalPuzzlesPlugin() {
  return {
    name: "dev-local-puzzles",
    configureServer(server: {
      config: { root: string };
      middlewares: { use: (path: string, fn: (req: any, res: any, next: () => void) => void) => void };
      watcher: { on: (event: string, fn: (path: string) => void) => void };
      ws: { send: (payload: { type: "full-reload" }) => void };
    }) {
      // A debug save (or any edit) reloads the page with the new file contents.
      const puzzlesDir = resolve(server.config.root, "puzzles");
      for (const event of ["add", "change", "unlink"]) {
        server.watcher.on(event, (path) => {
          if (resolve(path).startsWith(puzzlesDir + sep)) server.ws.send({ type: "full-reload" });
        });
      }
      server.middlewares.use("/dev/local-puzzles", (req, res, next) => {
        if (req.method !== "GET") { next(); return; }
        try {
          const url = (path: string) => "/" + relative(server.config.root, path).split(sep).map(encodeURIComponent).join("/");
          const list = readPuzzleFiles(puzzlesDir).map((p) => {
            const images = Object.fromEntries(p.images.map((i) => [i.kind, url(i.absPath)]));
            return {
              slug: basename(p.relPath, ".json"),
              hash: p.hash,
              filePath: `../puzzles/${p.relPath}`,
              json: JSON.parse(p.jsonText),
              solutionImageUrl: images.solution,
              sourceImageUrl: images.source,
            };
          });
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(list));
        } catch (e) {
          res.writeHead(500); res.end(String(e));
        }
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
    devLocalPuzzlesPlugin(),
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
