import { useEffect, useState } from "react";

export type Route = { readonly name: "home" } | { readonly name: "puzzle"; readonly id: string };

function parseHash(hash: string): Route {
  const path = hash.replace(/^#\/?/, "");
  if (path.startsWith("puzzle/")) {
    const id = path.slice("puzzle/".length).trim();
    if (id) return { name: "puzzle", id };
  }
  return { name: "home" };
}

export function navigate(to: string): void {
  window.location.hash = to;
}

export function useHashRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));

  useEffect(() => {
    function onHashChange() {
      setRoute(parseHash(window.location.hash));
    }
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  return route;
}
