import { lazy, Suspense, useEffect, useMemo } from "react";
import type { CrosswordJson } from "../src/index";
import { gridKey } from "./admin/gridKey";
import { getPuzzleById, usePuzzleLibrary } from "./puzzleLibrary";
import { refreshPuzzleCatalog } from "./puzzleSync";
import { useHashRoute, useHardwareBackButton, navigate } from "./router";
import { HomePage } from "./pages/HomePage";
import { SolverPage, type PuzzleEditor } from "./pages/SolverPage";
import { AuthProvider, useAuth } from "./AuthContext";

// Admin screens (and their Firebase Storage code) load only when an admin opens them.
const AdminPage = lazy(() => import("./admin/AdminPage"));
const DraftPage = lazy(() => import("./admin/DraftPage"));
const adminApi = () => import("./admin/adminApi");

// An admin's fixes to a published puzzle go straight to players.
function publishedEditor(id: string): PuzzleEditor {
  return {
    kind: "published",
    save: async (json: CrosswordJson) => {
      await (await adminApi()).savePublishedPuzzle(id, json);
      await refreshPuzzleCatalog();
    },
    unpublish: async () => {
      await (await adminApi()).unpublishPuzzle(id);
      navigate(`#/admin/draft/${encodeURIComponent(id)}`);
      await refreshPuzzleCatalog();
    },
  };
}

function AppRoutes() {
  const route = useHashRoute();
  useHardwareBackButton(route);
  const { isAdmin } = useAuth();
  // Re-render when downloaded puzzles arrive or change.
  const { ready } = usePuzzleLibrary();
  const puzzleId = route.name === "puzzle" ? route.id : undefined;
  const editor = useMemo(() => (isAdmin && puzzleId ? publishedEditor(puzzleId) : undefined), [isAdmin, puzzleId]);

  // Redirect unknown puzzle ids back to home, once the first check for new puzzles is done
  useEffect(() => {
    if (ready && route.name === "puzzle" && !getPuzzleById(route.id)) {
      navigate("#/");
    }
  }, [route, ready]);

  if (route.name === "admin" || route.name === "draft") {
    return (
      <Suspense fallback={null}>
        {route.name === "admin" ? <AdminPage /> : <DraftPage id={route.id} />}
      </Suspense>
    );
  }

  if (route.name === "puzzle") {
    const puzzle = getPuzzleById(route.id);
    if (puzzle) {
      return (
        <SolverPage
          // A newly downloaded version starts a fresh page (saved letters reload from the device);
          // while an admin edits, only grid changes do, so clue fixes keep the current page.
          key={`${puzzle.id}:${editor ? gridKey(puzzle.json) : puzzle.hash}`}
          id={puzzle.id}
          json={puzzle.json}
          solutionImageUrl={puzzle.solutionImageUrl}
          sourceImageUrl={puzzle.sourceImageUrl}
          editor={editor}
        />
      );
    }
    return null; // will redirect via effect above
  }

  return <HomePage />;
}

export function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
