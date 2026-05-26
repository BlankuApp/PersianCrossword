import { useEffect } from "react";
import { getPuzzleById } from "./puzzleLibrary";
import { useHashRoute, navigate } from "./router";
import { HomePage } from "./pages/HomePage";
import { SolverPage } from "./pages/SolverPage";
import { AuthProvider, useAuth } from "./AuthContext";

function AppRoutes() {
  const route = useHashRoute();
  const { syncVersion } = useAuth();

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
          key={syncVersion}
          id={puzzle.id}
          json={puzzle.json}
          solutionImageUrl={puzzle.solutionImageUrl}
          sourceImageUrl={puzzle.sourceImageUrl}
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
