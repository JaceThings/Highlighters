import { hasGlobal, hasWindow } from "../internal/dom.js";

export function findSelectionAnchor(node: Node): HTMLElement {
  if (!hasWindow() || !hasGlobal("getComputedStyle")) {
    return document.body ?? document.documentElement;
  }
  let el: Element | null = node instanceof Element ? node : node.parentElement;
  while (el && el !== document.body && el !== document.documentElement) {
    const position = getComputedStyle(el).position;
    if (position && position !== "static" && el instanceof HTMLElement) return el;
    el = el.parentElement;
  }
  return (
    document.querySelector<HTMLElement>("article") ??
    document.querySelector<HTMLElement>("main") ??
    document.body
  );
}
