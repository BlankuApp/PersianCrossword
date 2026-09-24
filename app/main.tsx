import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { upgradeLocalProgress } from "./cloudProgress";
import { installFlexGapFallback } from "./flexGapFallback";
import "./styles.css";

upgradeLocalProgress();

const root = document.getElementById("root");

if (!root) {
  throw new Error("Root element was not found.");
}

installFlexGapFallback();

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
