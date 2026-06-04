/**
 * Renderer contract re-exports plus the overlay-host helpers every tier shares.
 *
 * The overlay container, by construction (blueprint A4 / R30):
 *  - absolutely positioned, out of layout flow, so a mark can't cause layout shift (R36);
 *  - `aria-hidden` + `pointer-events: none`, so it's invisible to AT and never
 *    intercepts input (R30);
 *  - `isolation: isolate`, so `mix-blend-mode: multiply` composites against the
 *    intended backdrop rather than leaking into ancestor stacking contexts (A4);
 *  - `mix-blend-mode: multiply` by default, the subtractive-ink optic (R14) -
 *    individual nodes may override it.
 *
 * Nodes are pooled by stable identity (the per-line seed), not array index, so a
 * surviving line keeps its exact node and never flickers when the line set changes
 * (A14 §6 / R22d). {@link teardownContainer} leaves the DOM byte-for-byte as it was (R9).
 */

import type { Box } from "../types.js";

export type { Renderer, RenderContext } from "../types.js";

/** Marks an overlay host this module created, so teardown is unambiguous. */
const OVERLAY_FLAG = "data-highlighters-overlay";

/**
 * Per-element cache of the last inline value written for each style property.
 *
 * Re-assigning a `mask-image: url(data:…)` or `filter: url(#…)` - even to the SAME
 * value - can force the engine to re-decode the mask or re-rasterize the filter,
 * flickering an in-flight draw-on. This lets the style helpers skip no-op writes so
 * a no-op reflow is free and visually inert. Keyed by the APPLIED string, not the
 * computed value, so CSSOM quote/format normalization can't cause a false miss.
 */
const appliedStyles = new WeakMap<HTMLElement, Record<string, string>>();

/** Write via `apply` only if `value` differs from the last value cached for `key`. */
function applyOnce(el: HTMLElement, key: string, value: string, apply: () => void): void {
  let cache = appliedStyles.get(el);
  if (!cache) {
    cache = {};
    appliedStyles.set(el, cache);
  }
  if (cache[key] === value) return;
  cache[key] = value;
  apply();
}

/**
 * Set a style property in both its camelCase form and the `-webkit-` prefixed form
 * (for `clip-path` and `mask-*`), so engines that only understand the prefixed
 * property still pick up the value. Idempotent (avoids mask re-decode on reflow).
 */
export function setVendorPrefixed(
  el: HTMLElement,
  prop: "clipPath" | "maskImage" | "maskRepeat" | "maskPosition" | "maskSize",
  value: string,
): void {
  applyOnce(el, prop, value, () => {
    const s = el.style as CSSStyleDeclaration & Record<string, string>;
    s[prop] = value;
    const webkitProp = `webkit${prop.charAt(0).toUpperCase()}${prop.slice(1)}`;
    s[webkitProp] = value;
  });
}

/**
 * Set a plain inline style property idempotently. Use for the repaint-prone
 * properties (`filter`, `background-image`) so a no-op reflow never re-rasterizes
 * a mark mid-draw.
 */
export function setStyleOnce(el: HTMLElement, prop: string, value: string): void {
  applyOnce(el, prop, value, () => {
    (el.style as CSSStyleDeclaration & Record<string, string>)[prop] = value;
  });
}

/** Place an element as an absolutely-positioned px box from a {@link Box}. */
export function applyBoxPosition(el: HTMLElement, box: Box): void {
  const s = el.style;
  s.position = "absolute";
  s.left = `${box.x}px`;
  s.top = `${box.y}px`;
  s.width = `${box.width}px`;
  s.height = `${box.height}px`;
}

/**
 * Create (or return the existing) absolutely-positioned, isolated, `aria-hidden`,
 * non-interactive overlay host appended to `host`. Idempotent per host, so repeated
 * mounts on one target never leak nodes. The host is promoted to `position:
 * relative` only when static, anchoring the overlay without layout shift (R36).
 *
 * @param host - MUST be attached to a document for the overlay to paint.
 */
export function createOverlayContainer(host: HTMLElement): HTMLElement {
  const existing = host.querySelector<HTMLElement>(`:scope > [${OVERLAY_FLAG}]`);
  if (existing) return existing;

  const doc = host.ownerDocument;
  const container = doc.createElement("div");
  container.setAttribute(OVERLAY_FLAG, "");
  container.setAttribute("aria-hidden", "true");

  const s = container.style;
  s.position = "absolute";
  s.top = "0";
  s.left = "0";
  s.width = "100%";
  s.height = "100%";
  s.pointerEvents = "none";
  // Isolate so multiply composites against this overlay's own backdrop (A4), not
  // whatever ancestor stacking context happens to exist.
  s.isolation = "isolate";
  s.mixBlendMode = "multiply";
  s.overflow = "visible";
  s.userSelect = "none";

  // Promote only a statically-positioned host to `relative`, anchoring the overlay
  // without disturbing the host's layout.
  const view = doc.defaultView;
  if (view) {
    const position = view.getComputedStyle(host).position;
    if (position === "static") host.style.position = "relative";
  }

  host.appendChild(container);
  return container;
}

/**
 * Tear down a mark's overlay container after its renderer has unmounted. The
 * container is SHARED by every mark mounted on the same host (createOverlayContainer
 * reuses it), so the caller removes its own renderer's nodes first and this only
 * strips the container once no marks remain - removing one mark never tears down its
 * neighbours, and the last one out leaves the DOM byte-for-byte as before (R9).
 * Safe to call more than once or on a never-attached container.
 */
export function teardownContainer(container: HTMLElement): void {
  if (!container.firstChild) container.remove();
}

/**
 * A node pool keyed by stable line identity (the per-line seed). Keying by identity
 * rather than array index lets a surviving line keep its exact node across a reflow
 * that changes the line set, so it never flickers or re-seeds (A14 §6 / R22d).
 */
export class NodePool<T extends Node> {
  private readonly nodes = new Map<number, T>();

  get size(): number {
    return this.nodes.size;
  }

  get(key: number): T | undefined {
    return this.nodes.get(key);
  }

  set(key: number, node: T): void {
    this.nodes.set(key, node);
  }

  has(key: number): boolean {
    return this.nodes.has(key);
  }

  /**
   * Reconciliation after reflow: remove every pooled node whose key is not in
   * `keep`, calling `dispose` to detach it. Survivors keep their identity (R22d).
   */
  retain(keep: Set<number>, dispose: (node: T) => void): void {
    for (const [key, node] of this.nodes) {
      if (!keep.has(key)) {
        dispose(node);
        this.nodes.delete(key);
      }
    }
  }

  /** Remove and dispose every pooled node - on unmount, so no residue is left (R9). */
  clear(dispose: (node: T) => void): void {
    for (const node of this.nodes.values()) dispose(node);
    this.nodes.clear();
  }
}
