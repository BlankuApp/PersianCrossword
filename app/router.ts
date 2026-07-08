import { useEffect, useRef, useState } from "react";
import { App as CapacitorApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";

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

// On Android, the hardware back button should navigate within the app (puzzle -> home)
// instead of immediately closing it; only the second press from home should exit.
export function useHardwareBackButton(route: Route): void {
  const routeRef = useRef(route);
  routeRef.current = route;

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const listenerPromise = CapacitorApp.addListener("backButton", () => {
      if (routeRef.current.name === "puzzle") {
        navigate("#/");
      } else {
        CapacitorApp.exitApp();
      }
    });

    return () => {
      listenerPromise.then((handle) => handle.remove());
    };
  }, []);
}
