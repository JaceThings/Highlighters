import { hasWindow } from "../internal/dom.js";

/**
 * The element live selection marks should attach to: the nearest positioned ancestor of the
 * selection, or the reading surface (`article`, then `main`) when the walk reaches `body` (Cmd+A).
 * Overlays are children of this node with anchor-relative coordinates, so they scroll natively and
 * stay aligned when the viewport reflows — mounting on `document.body` drifts from centered columns.
 */
export function findSelectionAnchor(node: Node): HTMLElement {
  if (!hasWindow() || typeof getComputedStyle === "undefined") {
    return (document.body ?? document.documentElement) as HTMLElement;
  }
  let el: Element | null = node instanceof Element ? node : node.parentElement;
  while (el && el !== document.body && el !== document.documentElement) {
    const position = getComputedStyle(el).position;
    if (position && position !== "static") return el as HTMLElement;
    el = el.parentElement;
  }
  const contentRoot =
    document.querySelector<HTMLElement>("article") ??
    document.querySelector<HTMLElement>("main");
  return contentRoot ?? (document.body as HTMLElement);
}
