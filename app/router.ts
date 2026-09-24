import { useEffect, useRef, useState } from "react";
import { App as CapacitorApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";

export type Route =
  | { readonly name: "home" }
  | { readonly name: "puzzle"; readonly id: string }
  // Admin panel and one of its drafts (app/admin).
  | { readonly name: "admin" }
  | { readonly name: "draft"; readonly id: string };

export function parseHash(hash: string): Route {
  const path = hash.replace(/^#\/?/, "").split("?")[0]!;
  if (path.startsWith("puzzle/")) {
    const id = path.slice("puzzle/".length).trim();
    if (id) return { name: "puzzle", id };
  }
  if (path.startsWith("admin/draft/")) {
    const id = decodeURIComponent(path.slice("admin/draft/".length).trim());
    if (id) return { name: "draft", id };
  }
  if (path === "admin") return { name: "admin" };
  return { name: "home" };
}

export function navigate(to: string): void {
  window.location.hash = to;
}

// Last home URL including its page/filter query, so leaving a puzzle restores the list view.
let homeHash = "#/";

export function setHomeQuery(params: URLSearchParams): void {
  const query = params.toString();
  homeHash = query ? `#/?${query}` : "#/";
  // replaceState: filter tweaks shouldn't pile up history entries, and it doesn't fire hashchange.
  if ((window.location.hash || "#/") !== homeHash) {
    window.history.replaceState(window.history.state, "", homeHash);
  }
}

export function goHome(): void {
  navigate(homeHash);
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

// On Android, the hardware back button should navigate within the app (puzzle -> home)
// instead of immediately closing it; only the second press from home should exit.
export function useHardwareBackButton(route: Route): void {
  const routeRef = useRef(route);
  routeRef.current = route;

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const listenerPromise = CapacitorApp.addListener("backButton", () => {
      const { name } = routeRef.current;
      if (name === "puzzle" || name === "admin") {
        goHome();
      } else if (name === "draft") {
        navigate("#/admin");
      } else {
        CapacitorApp.exitApp();
      }
    });

    return () => {
      listenerPromise.then((handle) => handle.remove());
    };
  }, []);
}
