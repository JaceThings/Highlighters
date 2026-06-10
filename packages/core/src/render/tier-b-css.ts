/**
 * Tier B renderer: a CSS `linear-gradient` band. The lightweight tier.
 *
 * A per-line wrapper `<div>` holds a band `<div>` at `inset: 0` painted with the absolute-px end-pool
 * gradient and composited with `mix-blend-mode: multiply`. Edges are straight (no wave, no texture),
 * but colour, opacity, blend, and band position match Tier A, so degrading here changes fidelity not
 * identity. The wrapper carries only the box position (no clip), structurally identical to Tier A.
 *
 * Nodes are pooled by stable line identity; `unmount()` leaves the DOM pristine.
 */

import type { Renderer, RenderContext, MarkGeometry, PoolGradient, ColorValue } from "../types.js";
import { NodePool, applyBoxPosition, backdropElement, createBlendLayer } from "./renderer.js";
import { effectiveInk } from "./blend.js";

/**
 * Convert a {@link PoolGradient} into a CSS `linear-gradient(...)` with absolute-px stop positions
 * and `min`/`max` clamps so a short mark can't over-pool. Each stop's alpha is folded into its colour
 * via `color-mix(... transparent)`, normalized to the brightest stop, so the gradient carries relative
 * pooling + dry-out while the band's layer opacity supplies the base. Without normalization the
 * per-stop alpha never renders and the band is flat.
 */
export function poolGradientToCss(pool: PoolGradient, colorOverride?: ColorValue): string {
  const stops = pool.stops;
  let maxAlpha = 0;
  for (const s of stops) maxAlpha = Math.max(maxAlpha, s.opacity ?? 1);

  // Relative per-stop alpha (1 at the brightest stop) folded into the colour, so layer opacity stays the absolute base.
  const fill = (i: number): string => {
    const stop = stops[i] ?? stops[0];
    const rel = maxAlpha > 0 ? (stop?.opacity ?? 1) / maxAlpha : 1;
    const color = colorOverride ?? stop?.color ?? "transparent";
    return `color-mix(in srgb, ${color} ${Math.round(rel * 100)}%, transparent)`;
  };

  // Live-speed path: N core stops at pre-computed px positions between the two pool ends; no nested calc/min/max, so it parses everywhere.
  const positions = pool.coreStopsPositionsPx;
  if (positions) {
    const parts: string[] = [
      `linear-gradient(${pool.angle}deg`,
      `${fill(0)} ${pool.startInsetPx}px`,
    ];
    for (let i = 0; i < positions.length; i++) {
      parts.push(`${fill(i + 1)} ${round2(positions[i])}px`);
    }
    parts.push(`${fill(stops.length - 1)} calc(100% - ${pool.endInsetPx}px))`);
    return parts.join(", ");
  }

  // 4-stop gradient: absolute-px insets with min()/max() clamps keep the cap-pool width constant.
  const startCore = `min(${pool.startCorePx}px, ${pool.startCorePct}%)`;
  const endCore = `max(calc(100% - ${pool.endCorePx}px), ${pool.endCorePct}%)`;

  return [
    `linear-gradient(${pool.angle}deg`,
    `${fill(0)} ${pool.startInsetPx}px`,
    `${fill(1)} ${startCore}`,
    `${fill(2)} ${endCore}`,
    `${fill(3)} calc(100% - ${pool.endInsetPx}px))`,
  ].join(", ");
}

/** Round a px position to 2 decimals for a compact, stable gradient string. */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Create a Tier B renderer (`tier: "css"`). */
export function createCssRenderer(): Renderer {
  // Per line: a positioned wrapper (the draw-on wipe surface) holding a band node.
  const wrapperPool = new NodePool<HTMLElement>();
  const bandPool = new NodePool<HTMLElement>();
  let container: HTMLElement | null = null;
  // A private `normal`-blend layer for a near-white ink on a dark backdrop, so it escapes the shared
  // multiply container without flipping its blend (which would knock sibling marks out of multiply).
  let blendLayer: HTMLElement | null = null;

  function styleBand(
    el: HTMLElement,
    line: MarkGeometry,
    context: RenderContext,
    inkColor: ColorValue | undefined,
  ): void {
    const { options } = context;
    const s = el.style;
    s.position = "absolute";
    s.left = "0";
    s.top = "0";
    s.width = "100%";
    s.height = "100%";
    s.pointerEvents = "none";
    s.mixBlendMode = options.blendMode;
    // layerScale (live-speed path only, else 1) carries the band's absolute deposit so a uniformly-fast swipe dims here rather than normalizing to full.
    s.opacity = String(options.opacity * (line.pool.layerScale ?? 1));
    s.backgroundImage = poolGradientToCss(line.pool, inkColor);
    s.backgroundRepeat = "no-repeat";
    (s as CSSStyleDeclaration & { boxDecorationBreak?: string }).boxDecorationBreak = "clone";
    s.borderRadius = `${options.edge.radius}px`;
  }

  /** Reconcile the pool against the incoming line set, mounting/keeping nodes. */
  function render(context: RenderContext): void {
    container = context.container;
    const doc = container.ownerDocument;
    // Near-white ink on a dark backdrop, or any ink under vivid, escapes onto its own blend layer; everything else uses the shared container.
    const plan = effectiveInk(context.options.blendMode, context.options.color, backdropElement(context), doc, context.options.vivid);
    const host = container.parentElement;
    const target = plan.layer && host ? (blendLayer ??= createBlendLayer(host, plan.layer)) : container;
    const inkColor = plan.color === context.options.color ? undefined : plan.color;
    const keep = new Set<number>();

    for (const line of context.lines) {
      keep.add(line.seed);
      // The wrapper carries only the box position (no clip) so the draw-on wipes it open without scaling; its clip-path is left untouched across reflow.
      let wrapper = wrapperPool.get(line.seed);
      if (!wrapper) {
        wrapper = doc.createElement("div");
        wrapper.setAttribute("aria-hidden", "true");
        wrapper.style.pointerEvents = "none";
        wrapperPool.set(line.seed, wrapper);
      }
      if (wrapper.parentElement !== target) target.appendChild(wrapper);
      applyBoxPosition(wrapper, line.box);

      let band = bandPool.get(line.seed);
      if (!band) {
        band = doc.createElement("div");
        band.setAttribute("aria-hidden", "true");
        wrapper.appendChild(band);
        bandPool.set(line.seed, band);
      }
      styleBand(band, line, context, inkColor);
    }

    // Release vanished lines (the wrapper takes its band child with it); survivors keep their identical subtree.
    wrapperPool.retain(keep, (el) => el.remove());
    bandPool.retain(keep, () => {});
  }

  return {
    tier: "css",
    mount: render,
    update: render,
    bandFor: (seed: number): HTMLElement | null => wrapperPool.get(seed) ?? null,
    unmount(): void {
      wrapperPool.clear((el) => el.remove());
      bandPool.clear(() => {});
      blendLayer?.remove();
      blendLayer = null;
      container = null;
    },
  };
}
