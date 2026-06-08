/**
 * Renderer contract re-exports plus the overlay-host helpers every tier shares.
 *
 * The overlay container, by construction:
 *  - absolutely positioned, out of layout flow, so a mark can't cause layout shift;
 *  - `aria-hidden` + `pointer-events: none`, so it's invisible to AT and never intercepts input;
 *  - `isolation: isolate`, so `mix-blend-mode: multiply` composites against the intended backdrop
 *    rather than leaking into ancestor stacking contexts;
 *  - `mix-blend-mode: multiply` by default (the subtractive-ink optic); individual nodes may override it.
 *
 * Nodes are pooled by stable identity (the per-line seed), not array index, so a surviving line keeps
 * its exact node and never flickers when the line set changes. {@link teardownContainer} leaves the DOM as it was.
 */

import type { BlendMode, Box, RenderContext } from "../types.js";

export type { Renderer, RenderContext } from "../types.js";

/** Marks an overlay host this module created, so teardown is unambiguous. */
const OVERLAY_FLAG = "data-highlighters-overlay";

/**
 * Per-element cache of the last inline value written per style property, so the helpers skip no-op writes.
 * Re-assigning `mask-image`/`filter` even to the same value can force a mask re-decode or filter
 * re-rasterize that flickers an in-flight draw-on. Keyed by the applied string, not the computed value.
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

/** Set a style property in both camelCase and `-webkit-` prefixed forms. Idempotent (avoids mask re-decode on reflow). */
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

/** Set a plain inline style property idempotently; use for repaint-prone properties (`filter`, `background-image`). */
export function setStyleOnce(el: HTMLElement, prop: string, value: string): void {
  applyOnce(el, prop, value, () => {
    (el.style as CSSStyleDeclaration & Record<string, string>)[prop] = value;
  });
}

/** The element behind a mark's first range, for backdrop-aware ink choices. Falls back to the overlay host. */
export function backdropElement(context: RenderContext): Element | null {
  const node = context.ranges[0]?.commonAncestorContainer;
  const el = node instanceof Element ? node : (node?.parentElement ?? null);
  return el ?? context.container.parentElement;
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
 * Create (or return the existing) absolutely-positioned, isolated, `aria-hidden`, non-interactive
 * overlay host appended to `host`. Idempotent per host. A static host is promoted to
 * `position: relative`, anchoring the overlay without layout shift.
 * @param host - MUST be attached to a document for the overlay to paint.
 */
export function createOverlayContainer(host: HTMLElement): HTMLElement {
  const existing = host.querySelector<HTMLElement>(`:scope > [${OVERLAY_FLAG}]`);
  if (existing) return existing;

  const doc = host.ownerDocument;
  const container = doc.createElement("div");
  container.setAttribute(OVERLAY_FLAG, "");
  styleOverlayLayer(container, "multiply");

  // Promote only a static host to `relative`, anchoring the overlay without disturbing its layout.
  const view = doc.defaultView;
  if (view) {
    const position = view.getComputedStyle(host).position;
    if (position === "static") host.style.position = "relative";
  }

  host.appendChild(container);
  return container;
}

/** Style an element as a positioned, isolated, non-interactive overlay layer with `blend` compositing. */
function styleOverlayLayer(el: HTMLElement, blend: BlendMode): void {
  el.setAttribute("aria-hidden", "true");
  const s = el.style;
  s.position = "absolute";
  s.top = "0";
  s.left = "0";
  s.width = "100%";
  s.height = "100%";
  s.pointerEvents = "none";
  // Isolate so the blend composites against this overlay's own backdrop, not an ancestor stacking context.
  s.isolation = "isolate";
  s.mixBlendMode = blend;
  s.overflow = "visible";
  s.userSelect = "none";
}

/**
 * An extra overlay layer on `host` with a non-default blend, for a mark whose ink can't use the shared
 * multiply container - a near-white ink on a dark backdrop needs `normal` to stay visible. Fills the
 * host identically to the shared container (so host-relative line boxes line up), but is uncached and
 * unflagged: the renderer that creates it owns its lifetime, and it never disturbs sibling marks.
 */
export function createBlendLayer(host: Element, blend: BlendMode): HTMLElement {
  const layer = host.ownerDocument.createElement("div");
  styleOverlayLayer(layer, blend);
  host.appendChild(layer);
  return layer;
}

/**
 * Tear down a mark's overlay container after its renderer unmounted. The container is shared by every
 * mark on the same host, so this only strips it once no marks remain: removing one mark never tears
 * down its neighbours. Safe to call more than once or on a never-attached container.
 */
export function teardownContainer(container: HTMLElement): void {
  if (!container.firstChild) container.remove();
}

/** A node pool keyed by stable line identity (the per-line seed), so a surviving line keeps its exact node across a reflow that changes the line set. */
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

  /** Reconcile after reflow: dispose every pooled node whose key is not in `keep`. Survivors keep their identity. */
  retain(keep: Set<number>, dispose: (node: T) => void): void {
    for (const [key, node] of this.nodes) {
      if (!keep.has(key)) {
        dispose(node);
        this.nodes.delete(key);
      }
    }
  }

  /** Dispose every pooled node, on unmount, so no residue is left. */
  clear(dispose: (node: T) => void): void {
    for (const node of this.nodes.values()) dispose(node);
    this.nodes.clear();
  }
}
