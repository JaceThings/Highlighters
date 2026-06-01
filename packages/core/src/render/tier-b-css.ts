/**
 * Tier B renderer — a CSS `linear-gradient` band (blueprint R26 / A3).
 *
 * The lightweight tier: one absolutely-positioned per-line **wrapper** `<div>`
 * placed at the line box, holding a band `<div>` at `inset: 0` painted with the
 * absolute-px end-pool gradient ({@link PoolGradient}) and composited with
 * `mix-blend-mode: multiply` (the true ink optic, R14). Edges are straight — no
 * wave geometry, no turbulence texture — but colour, opacity, blend, and band
 * position are shared with Tier A, so degrading to this tier changes fidelity, not
 * identity (R28). `box-decoration-break: clone` is set so that a future inline
 * rendering of the band keeps its decoration per fragment; the per-line `<div>`
 * model already gives correct multiline coverage.
 *
 * The wrapper carries only the box position (no clip), so the shared draw-on
 * animation wipes it open with `clip-path: inset(...)` — revealing the fixed band
 * left-to-right with no scaling, identical in structure to Tier A.
 *
 * Nodes are pooled by stable line identity (the per-line seed) so a reflow that
 * changes the line set keeps surviving lines' nodes (A14 §6 / R22d). `unmount()`
 * removes the overlay container and every node, leaving the DOM pristine (R9).
 */

import type { Renderer, RenderContext, MarkGeometry, PoolGradient } from "../types.js";
import { NodePool, applyBoxPosition } from "./renderer.js";

/**
 * Convert a {@link PoolGradient} into a CSS `linear-gradient(...)` string in
 * absolute-px stop positions with the documented `min`/`max` clamps (A14 §3), so
 * a short mark cannot over-pool.
 *
 * Each stop's alpha is folded into its colour with `color-mix(... transparent)`
 * (matching Tier C), normalized to the brightest stop — so the gradient carries
 * the RELATIVE pooling + dry-out variation while the band's layer opacity supplies
 * the base. The darkest point therefore matches a flat band, and the pooled/dried
 * regions read lighter (without this the per-stop alpha never rendered and the
 * band was flat).
 *
 * @param pool - The absolute-px end-pool gradient from the mark geometry.
 * @returns A CSS `linear-gradient(...)` value.
 */
export function poolGradientToCss(pool: PoolGradient): string {
  const stops = pool.stops;
  let maxAlpha = 0;
  for (const s of stops) maxAlpha = Math.max(maxAlpha, s.opacity ?? 1);

  // Relative per-stop alpha (1 at the brightest stop) folded into the colour, so
  // the layer opacity stays the absolute base. 100% = colour as-is, lower = drier.
  const fill = (i: number): string => {
    const stop = stops[i] ?? stops[0];
    const rel = maxAlpha > 0 ? (stop?.opacity ?? 1) / maxAlpha : 1;
    return `color-mix(in srgb, ${stop?.color ?? "transparent"} ${Math.round(rel * 100)}%, transparent)`;
  };

  // Absolute-px insets with min()/max() clamps keep the cap-pool width constant:
  //   2px, min(10px, 40%), max(100% - 10px, 60%), 100% - 2px.
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

/**
 * Create a Tier B renderer.
 *
 * @returns A {@link Renderer} whose `tier` is `"css"`.
 */
export function createCssRenderer(): Renderer {
  // Per line: a positioned WRAPPER (the draw-on wipe surface) holding a band node.
  const wrapperPool = new NodePool<HTMLElement>();
  const bandPool = new NodePool<HTMLElement>();
  let container: HTMLElement | null = null;

  /** Style one line band from its geometry and the resolved options. */
  function styleBand(el: HTMLElement, line: MarkGeometry, context: RenderContext): void {
    const { options } = context;
    const s = el.style;
    // The band fills its wrapper (which is positioned at the line box).
    s.position = "absolute";
    s.left = "0";
    s.top = "0";
    s.width = "100%";
    s.height = "100%";
    s.pointerEvents = "none";
    s.mixBlendMode = options.blendMode;
    s.opacity = String(options.opacity);
    // The pool gradient already carries the end-pooling; box-decoration-break is
    // set for parity with an inline rendering of the same band.
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
