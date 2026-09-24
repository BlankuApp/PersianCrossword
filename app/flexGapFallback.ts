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
  const rtl = cs.direction === "rtl";
  // `start` faces the previous item, `end` the next: top/bottom for columns, inline sides for rows.
  const [start, end] = column
    ? reverse ? ["marginBottom", "marginTop"] as const : ["marginTop", "marginBottom"] as const
    : rtl !== reverse ? ["marginRight", "marginLeft"] as const : ["marginLeft", "marginRight"] as const;
  const gap = column ? rowGap : columnGap;
  const wraps = !column && cs.flexWrap !== "nowrap";

  // Flex items: displayed in-flow elements (icons are SVG, not HTML) and non-blank text runs.
  const items: (Styled | Text)[] = [];
  for (const node of container.childNodes) {
    if (node instanceof Text) {
      if (node.data.trim()) items.push(node);
    } else if (node instanceof HTMLElement || node instanceof SVGElement) {
      const ncs = getComputedStyle(node);
      if (ncs.display !== "none" && ncs.position !== "absolute" && ncs.position !== "fixed") items.push(node);
    }
  }

  items.forEach((item, i) => {
    if (wraps && !(item instanceof Text)) setMargin(item, "marginBottom", rowGap);
    if (i === 0) return;
    // Each gap goes on the later item; a text run can't take a margin, so then on the earlier one.
    const prev = items[i - 1]!;
    if (!(item instanceof Text)) setMargin(item, start, gap);
    else if (!(prev instanceof Text)) setMargin(prev, end, gap);
  });
}

type Styled = HTMLElement | SVGElement;
type Side = "marginTop" | "marginBottom" | "marginLeft" | "marginRight";

function setMargin(el: Styled, side: Side, value: string): void {
  // Leave authored margins (e.g. `margin-left: auto`) alone; our own inline value is re-set.
  if (el.style[side] || getComputedStyle(el)[side] === "0px") el.style[side] = value;
}
