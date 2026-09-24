import { useEffect } from "react";
import { getPuzzleById, usePuzzleLibrary } from "./puzzleLibrary";
import { useHashRoute, useHardwareBackButton, navigate } from "./router";
import { HomePage } from "./pages/HomePage";
import { SolverPage } from "./pages/SolverPage";
import { AuthProvider } from "./AuthContext";

function AppRoutes() {
  const route = useHashRoute();
  useHardwareBackButton(route);
  // Re-render when downloaded puzzles arrive or change.
  const { ready } = usePuzzleLibrary();

  // Redirect unknown puzzle ids back to home, once the first check for new puzzles is done
  useEffect(() => {
    if (ready && route.name === "puzzle" && !getPuzzleById(route.id)) {
      navigate("#/");
    }
  }, [route, ready]);

  if (route.name === "puzzle") {
    const puzzle = getPuzzleById(route.id);
    if (puzzle) {
      return (
        <SolverPage
          // A newly downloaded version starts a fresh page (saved letters reload from the device).
          key={`${puzzle.id}:${puzzle.hash}`}
          id={puzzle.id}
          json={puzzle.json}
          solutionImageUrl={puzzle.solutionImageUrl}
          sourceImageUrl={puzzle.sourceImageUrl}
          filePath={puzzle.filePath}
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
