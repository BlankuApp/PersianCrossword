import { useEffect } from "react";
import { getPuzzleById } from "./puzzleLibrary";
import { useHashRoute, navigate } from "./router";
import { HomePage } from "./pages/HomePage";
import { SolverPage } from "./pages/SolverPage";

export function App() {
  const route = useHashRoute();

  // Redirect unknown puzzle ids back to home
  useEffect(() => {
    if (route.name === "puzzle" && !getPuzzleById(route.id)) {
      navigate("#/");
    }
  }, [route]);

  if (route.name === "puzzle") {
    const puzzle = getPuzzleById(route.id);
    if (puzzle) {
      return (
        <SolverPage
          id={puzzle.id}
          json={puzzle.json}
          solutionImageUrl={puzzle.solutionImageUrl}
        />
      );
    }
    return null; // will redirect via effect above
  }

  return <HomePage />;
}
