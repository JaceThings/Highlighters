import { hasGlobal, hasWindow } from "../internal/dom.js";

export function findSelectionAnchor(node: Node): HTMLElement {
  if (!hasWindow() || !hasGlobal("getComputedStyle")) {
    return (document.body ?? document.documentElement) as HTMLElement;
  }
  let el: Element | null = node instanceof Element ? node : node.parentElement;
  while (el && el !== document.body && el !== document.documentElement) {
    const position = getComputedStyle(el).position;
    if (position && position !== "static") return el as HTMLElement;
    el = el.parentElement;
  }
  return (
    document.querySelector<HTMLElement>("article") ??
    document.querySelector<HTMLElement>("main") ??
    (document.body as HTMLElement)
  );
}
