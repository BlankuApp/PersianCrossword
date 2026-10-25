import { useEffect, useRef, useState } from "react";
import { App as CapacitorApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";

export type Route =
  | { readonly name: "home" }
  | { readonly name: "puzzle"; readonly id: string; readonly slotId?: string }
  | { readonly name: "contact" }
  | { readonly name: "support" }
  | { readonly name: "supportThread"; readonly id: string }
  // Admin panel and one of its drafts (app/admin).
  | { readonly name: "admin" }
  | { readonly name: "draft"; readonly id: string };

export function parseHash(hash: string): Route {
  const [path = "", query = ""] = hash.replace(/^#\/?/, "").split(/\?(.*)/s);
  if (path.startsWith("puzzle/")) {
    let id = path.slice("puzzle/".length).trim();
    try { id = decodeURIComponent(id); } catch { return { name: "home" }; }
    const slotId = new URLSearchParams(query).get("slot");
    if (id) return { name: "puzzle", id, ...(slotId ? { slotId } : {}) };
  }
  if (path.startsWith("admin/draft/")) {
    const id = decodeURIComponent(path.slice("admin/draft/".length).trim());
    if (id) return { name: "draft", id };
  }
  if (path === "admin") return { name: "admin" };
  if (path === "contact") return { name: "contact" };
  if (path === "support") return { name: "support" };
  if (path.startsWith("support/thread/")) {
    try {
      const id = decodeURIComponent(path.slice("support/thread/".length).trim());
      if (id) return { name: "supportThread", id };
    } catch { return { name: "home" }; }
  }
  return { name: "home" };
}

export function puzzleHash(id: string, slotId?: string): string {
  return `#/puzzle/${encodeURIComponent(id)}${slotId ? `?slot=${encodeURIComponent(slotId)}` : ""}`;
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
      if (name === "puzzle" || name === "admin" || name === "contact" || name === "support") {
        goHome();
      } else if (name === "supportThread") {
        navigate("#/support");
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
