/**
 * Renderer contract re-exports plus the overlay-host helpers every renderer tier
 * shares.
 *
 * A {@link Renderer} owns the DOM and paint for a single mark: it mounts overlay
 * nodes for the per-line geometry, applies updates without re-seeding stable
 * geometry, and tears everything down on `unmount`. The two helpers here give the
 * DOM-touching tiers (A and B) a single, idempotent way to create and dispose the
 * positioned overlay container that holds their nodes.
 *
 * The container is, by construction (blueprint A4 / R30):
 *
 *  - **absolutely positioned** and removed from layout flow, so a mark can never
 *    cause cumulative layout shift (R36);
 *  - **`aria-hidden="true"`** and **`pointer-events: none`**, so the decorative
 *    overlay is invisible to assistive tech and never intercepts input (R30);
 *  - **`isolation: isolate`**, so `mix-blend-mode: multiply` composites against the
 *    intended backdrop rather than leaking into ancestor stacking contexts (A4);
 *  - **`mix-blend-mode: multiply`** by default, the true subtractive-ink optic
 *    (R14) — individual nodes may override it.
 *
 * Nodes within a container are pooled by **stable identity** (the per-line seed),
 * not by array index, so when the set of visible lines changes the surviving lines
 * keep their exact node and never flicker or re-seed (A14 §6 / R22d). The pool map
 * lives on the renderer, but {@link teardownContainer} guarantees that removing a
 * container leaves the DOM byte-for-byte as it was before the mark existed (R9).
 */

import type { Box } from "../types.js";

export type { Renderer, RenderContext } from "../types.js";

/** Marks an overlay host this module created, so teardown is unambiguous. */
const OVERLAY_FLAG = "data-highlighters-overlay";

/**
 * Per-element cache of the last inline value written for each style property.
 *
 * The renderer re-runs on every reflow (resize/font-load), and `update()` re-styles
 * each surviving node. Blindly re-assigning a `mask-image: url(data:…)` or a
 * `filter: url(#…)` — even to the *same* value — can force the engine to re-decode
 * the mask SVG or re-rasterize the filter, which flickers an in-flight draw-on. A
 * `WeakMap` keyed by element (so detached nodes are GC'd with their cache) lets the
 * style helpers skip writes that wouldn't change anything, making a no-op reflow
 * truly free and visually inert. Keyed by the *applied string*, not the computed
 * value, so CSSOM quote/format normalization can't cause a false miss.
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
 * Set a style property that needs both its standard camelCase form and the
 * `-webkit-` prefixed form, matching the cast-and-assign idiom the DOM-touching
 * tiers use for `clip-path` and `mask-*`. Both writes happen so engines that
 * only understand the prefixed property still pick up the value. Idempotent:
 * re-setting the same value is a no-op (avoids mask re-decode flicker on reflow).
 *
 * @param el - The element whose inline style to set.
 * @param prop - The standard camelCase style property to set.
 * @param value - The value to assign to both the standard and prefixed forms.
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
 * Set a plain (non-prefixed) inline style property idempotently — re-setting the
 * same value is a no-op. Use for the repaint-prone properties (`filter`,
 * `background-image`) so a reflow that doesn't change them never re-rasterizes a
 * mark mid-draw.
 *
 * @param el - The element whose inline style to set.
 * @param prop - The camelCase style property to set.
 * @param value - The value to assign.
 */
export function setStyleOnce(el: HTMLElement, prop: string, value: string): void {
  applyOnce(el, prop, value, () => {
    (el.style as CSSStyleDeclaration & Record<string, string>)[prop] = value;
  });
}

/**
 * Position an element as an absolutely-placed box, in px, from a {@link Box}.
 * Logic-free: sets `position: absolute` plus `left`/`top`/`width`/`height`,
 * matching the per-line band placement the tiers share.
 *
 * @param el - The element to position.
 * @param box - The absolute-px rectangle to place it at.
 */
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
 * non-interactive overlay host appended to `host`.
 *
 * Idempotent per host: a second call returns the same container rather than
 * stacking a fresh one, so repeated mounts on one target never leak nodes. The
 * host is given `position: relative` only when it is currently statically
 * positioned, so the absolutely-positioned overlay anchors to it without changing
 * the host's own box (R36 — no layout shift).
 *
 * @param host - The element the overlay attaches to (the mark's positioned
 *   container). MUST be attached to a document for the overlay to paint.
 * @returns The overlay container element, ready for renderer nodes.
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
  // Isolate so multiply composites against this overlay's own backdrop (A4),
  // not against whatever ancestor stacking context happens to exist.
  s.isolation = "isolate";
  s.mixBlendMode = "multiply";
  // Belt-and-braces: the overlay must never participate in layout or intercept
  // selection, find-in-page, or clicks on the real text beneath it.
  s.overflow = "visible";
  s.userSelect = "none";

  // Anchor the absolute overlay to `host` without disturbing its layout: only
  // promote a statically-positioned host to `relative`.
  const view = doc.defaultView;
  if (view) {
    const position = view.getComputedStyle(host).position;
    if (position === "static") host.style.position = "relative";
  }

  host.appendChild(container);
  return container;
}

/**
 * Remove an overlay container and every child node it holds, leaving the DOM
 * pristine (R9). Safe to call more than once and safe to call on a container that
 * was never attached.
 *
 * @param container - A container previously returned by
 *   {@link createOverlayContainer}.
 */
export function teardownContainer(container: HTMLElement): void {
  // Drop children explicitly so any references the renderer's pool still holds
  // resolve to detached nodes, then remove the host itself.
  while (container.firstChild) container.removeChild(container.firstChild);
  container.remove();
}

/**
 * A node pool keyed by stable line identity (the per-line seed), shared by the
 * DOM-touching tiers. Keying by identity rather than array index is what lets a
 * surviving line keep its exact node across a reflow that changes the line set,
 * so it never flickers or re-seeds (A14 §6 / R22d).
 *
 * @typeParam T - The pooled node type (e.g. `HTMLDivElement`, `SVGGElement`).
 */
export class NodePool<T extends Node> {
  private readonly nodes = new Map<number, T>();

  /** The number of live nodes currently pooled. */
  get size(): number {
    return this.nodes.size;
  }

  /** Return the node for `key`, or `undefined` if none is pooled yet. */
  get(key: number): T | undefined {
    return this.nodes.get(key);
  }

  /** Store `node` under `key`, replacing any previous node for that key. */
  set(key: number, node: T): void {
    this.nodes.set(key, node);
  }

  /** Whether a node is pooled for `key`. */
  has(key: number): boolean {
    return this.nodes.has(key);
  }

  /**
   * Remove every pooled node whose key is **not** in `keep`, calling `dispose`
   * on each removed node so the caller can detach it from the DOM. This is the
   * reconciliation step after a reflow: lines that vanished are released, lines
   * that survived keep their identity (R22d).
   *
   * @param keep - The set of keys that should remain pooled.
   * @param dispose - Invoked with each evicted node (detach it here).
   */
  retain(keep: Set<number>, dispose: (node: T) => void): void {
    for (const [key, node] of this.nodes) {
      if (!keep.has(key)) {
        dispose(node);
        this.nodes.delete(key);
      }
    }
  }

  /**
   * Remove and dispose **every** pooled node. Used on unmount so the renderer
   * leaves no residue (R9).
   *
   * @param dispose - Invoked with each node before it is dropped.
   */
  clear(dispose: (node: T) => void): void {
    for (const node of this.nodes.values()) dispose(node);
    this.nodes.clear();
  }
}
