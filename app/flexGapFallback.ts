/**
 * WebView < 84 (unupdated old Android phones) ignores `gap` on flex containers, and CSS
 * can't feature-detect that. On those WebViews only, turn each flex container's gap into
 * margins on its items. Newer browsers never run past the support check.
 */
export function installFlexGapFallback(): void {
  if (supportsFlexGap()) return;

  const pending = new Set<Element>();
  let raf = 0;
  function schedule(el: Element): void {
    pending.add(el);
    if (!raf) raf = requestAnimationFrame(flush);
  }
  function flush(): void {
    raf = 0;
    for (const el of pending) {
      applyGap(el);
      el.querySelectorAll("*").forEach(applyGap);
    }
    pending.clear();
  }

  new MutationObserver((mutations) => {
    for (const m of mutations) if (m.target instanceof Element) schedule(m.target);
  }).observe(document.body, { childList: true, subtree: true });
  // Media queries can change gap or direction.
  window.addEventListener("resize", () => schedule(document.body));
  schedule(document.body);
}

function supportsFlexGap(): boolean {
  const box = document.createElement("div");
  box.style.cssText = "display:flex;flex-direction:column;row-gap:1px;position:absolute";
  box.append(document.createElement("div"), document.createElement("div"));
  document.body.append(box);
  const ok = box.scrollHeight === 1;
  box.remove();
  return ok;
}

function applyGap(container: Element): void {
  const cs = getComputedStyle(container);
  if (cs.display !== "flex" && cs.display !== "inline-flex") return;
  const columnGap = cs.columnGap === "normal" ? "0px" : cs.columnGap;
  const rowGap = cs.rowGap === "normal" ? "0px" : cs.rowGap;
  if (columnGap === "0px" && rowGap === "0px") return;

  const column = cs.flexDirection.startsWith("column");
  const reverse = cs.flexDirection.endsWith("reverse");
  // The side facing the previous item: top for columns, the inline-start side for rows.
  const rtl = cs.direction === "rtl";
  const side = column
    ? reverse ? "marginBottom" : "marginTop"
    : rtl !== reverse ? "marginRight" : "marginLeft";
  const wraps = cs.flexWrap !== "nowrap";

  let first = true;
  for (const child of container.children) {
    if (!(child instanceof HTMLElement)) continue;
    const ccs = getComputedStyle(child);
    if (ccs.display === "none" || ccs.position === "absolute" || ccs.position === "fixed") continue;
    // Leave authored margins (e.g. `margin-left: auto`) alone.
    if (!first && (child.style[side] || ccs[side] === "0px")) child.style[side] = column ? rowGap : columnGap;
    if (wraps && !column && (child.style.marginBottom || ccs.marginBottom === "0px")) child.style.marginBottom = rowGap;
    first = false;
  }
}
