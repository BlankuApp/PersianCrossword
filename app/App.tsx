import { useEffect } from "react";
import { getPuzzleById } from "./puzzleLibrary";
import { useHashRoute, useHardwareBackButton, navigate } from "./router";
import { HomePage } from "./pages/HomePage";
import { SolverPage } from "./pages/SolverPage";
import { AuthProvider } from "./AuthContext";

function AppRoutes() {
  const route = useHashRoute();
  useHardwareBackButton(route);

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
