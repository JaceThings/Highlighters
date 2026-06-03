/**
 * Tier B renderer — a CSS `linear-gradient` band (blueprint R26 / A3).
 *
 * The lightweight tier: a per-line WRAPPER `<div>` holding a band `<div>` at
 * `inset: 0` painted with the absolute-px end-pool gradient and composited with
 * `mix-blend-mode: multiply` (R14). Edges are straight — no wave, no texture — but
 * colour, opacity, blend, and band position are shared with Tier A, so degrading
 * here changes fidelity, not identity (R28). The wrapper carries only the box
 * position (no clip) so the draw-on wipes it open with `clip-path: inset(...)`,
 * structurally identical to Tier A.
 *
 * Nodes are pooled by stable line identity (A14 §6 / R22d); `unmount()` leaves the
 * DOM pristine (R9).
 */

import type { Renderer, RenderContext, MarkGeometry, PoolGradient } from "../types.js";
import { NodePool, applyBoxPosition } from "./renderer.js";

/**
 * Convert a {@link PoolGradient} into a CSS `linear-gradient(...)` with absolute-px
 * stop positions and `min`/`max` clamps (A14 §3) so a short mark can't over-pool.
 *
 * Each stop's alpha is folded into its colour via `color-mix(... transparent)`,
 * normalized to the brightest stop, so the gradient carries the RELATIVE pooling +
 * dry-out while the band's layer opacity supplies the base. The darkest point thus
 * matches a flat band; pooled/dried regions read lighter. (Without normalization
 * the per-stop alpha never rendered and the band was flat.)
 */
export function poolGradientToCss(pool: PoolGradient): string {
  const stops = pool.stops;
  let maxAlpha = 0;
  for (const s of stops) maxAlpha = Math.max(maxAlpha, s.opacity ?? 1);

  // Relative per-stop alpha (1 at the brightest stop) folded into the colour, so
  // the layer opacity stays the absolute base.
  const fill = (i: number): string => {
    const stop = stops[i] ?? stops[0];
    const rel = maxAlpha > 0 ? (stop?.opacity ?? 1) / maxAlpha : 1;
    return `color-mix(in srgb, ${stop?.color ?? "transparent"} ${Math.round(rel * 100)}%, transparent)`;
  };

  // Live-speed path: N core stops at pre-computed px positions between the two
  // px-pool ends, the same color-mix normalization generalized over the array. No
  // nested calc/min/max (positions are already px), so it parses everywhere.
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

  // Legacy 4-stop gradient — absolute-px insets with min()/max() clamps keep the
  // cap-pool width constant.
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
  // Per line: a positioned WRAPPER (the draw-on wipe surface) holding a band node.
  const wrapperPool = new NodePool<HTMLElement>();
  const bandPool = new NodePool<HTMLElement>();
  let container: HTMLElement | null = null;

  function styleBand(el: HTMLElement, line: MarkGeometry, context: RenderContext): void {
    const { options } = context;
    const s = el.style;
    s.position = "absolute";
    s.left = "0";
    s.top = "0";
    s.width = "100%";
    s.height = "100%";
    s.pointerEvents = "none";
    s.mixBlendMode = options.blendMode;
    // layerScale (live-speed path only, else 1) carries the band's ABSOLUTE deposit
    // so a uniformly-fast swipe dims here rather than being normalized back to full.
    s.opacity = String(options.opacity * (line.pool.layerScale ?? 1));
    s.backgroundImage = poolGradientToCss(line.pool);
    s.backgroundRepeat = "no-repeat";
    (s as CSSStyleDeclaration & { boxDecorationBreak?: string }).boxDecorationBreak = "clone";
    s.borderRadius = `${options.edge.radius}px`;
  }

  /** Reconcile the pool against the incoming line set, mounting/keeping nodes. */
  function render(context: RenderContext): void {
    container = context.container;
    const doc = container.ownerDocument;
    const keep = new Set<number>();

    for (const line of context.lines) {
      keep.add(line.seed);
      // The wrapper carries ONLY the box position (no clip) so the draw-on wipes
      // it open without scaling; its clip-path is left untouched across reflow.
      let wrapper = wrapperPool.get(line.seed);
      if (!wrapper) {
        wrapper = doc.createElement("div");
        wrapper.setAttribute("aria-hidden", "true");
        wrapper.style.pointerEvents = "none";
        container.appendChild(wrapper);
        wrapperPool.set(line.seed, wrapper);
      }
      applyBoxPosition(wrapper, line.box);

      let band = bandPool.get(line.seed);
      if (!band) {
        band = doc.createElement("div");
        band.setAttribute("aria-hidden", "true");
        wrapper.appendChild(band);
        bandPool.set(line.seed, band);
      }
      styleBand(band, line, context);
    }

    // Release lines that no longer exist (the wrapper takes its band child with
    // it); survivors keep their identical wrapper subtree.
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
      container = null;
    },
  };
}
