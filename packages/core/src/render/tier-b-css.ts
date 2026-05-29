/**
 * Tier B renderer — a CSS `linear-gradient` band (blueprint R26 / A3).
 *
 * The lightweight tier: one absolutely-positioned `<div>` per visual line, painted
 * with the absolute-px end-pool gradient ({@link PoolGradient}) and composited with
 * `mix-blend-mode: multiply` (the true ink optic, R14). Edges are straight — no
 * wave geometry, no turbulence texture — but colour, opacity, blend, and band
 * position are shared with Tier A, so degrading to this tier changes fidelity, not
 * identity (R28). `box-decoration-break: clone` is set so that a future inline
 * rendering of the band keeps its decoration per fragment; the per-line `<div>`
 * model already gives correct multiline coverage.
 *
 * Nodes are pooled by stable line identity (the per-line seed) so a reflow that
 * changes the line set keeps surviving lines' nodes (A14 §6 / R22d). `unmount()`
 * removes the overlay container and every node, leaving the DOM pristine (R9).
 */

import type { Renderer, RenderContext, MarkGeometry, PoolGradient } from "../types.js";
import { NodePool } from "./renderer.js";

/**
 * Convert a {@link PoolGradient} into a CSS `linear-gradient(...)` string in
 * absolute-px stop positions with the documented `min`/`max` clamps (A14 §3), so
 * a short mark cannot over-pool. The middle plateau uses the resolved stop
 * colours; the ends darken toward the pool stops.
 *
 * @param pool - The absolute-px end-pool gradient from the mark geometry.
 * @returns A CSS `linear-gradient(...)` value.
 */
export function poolGradientToCss(pool: PoolGradient): string {
  const stops = pool.stops;
  const startColor = stops[0]?.color ?? "transparent";
  const endColor = stops[stops.length - 1]?.color ?? startColor;
  const coreColor = stops[Math.floor(stops.length / 2)]?.color ?? startColor;

  // Absolute-px insets with min()/max() clamps keep the cap-pool width constant:
  //   2px, min(10px, 40%), max(100% - 10px, 60%), 100% - 2px.
  const startCore = `min(${pool.startCorePx}px, ${pool.startCorePct}%)`;
  const endCore = `max(calc(100% - ${pool.endCorePx}px), ${pool.endCorePct}%)`;

  return [
    `linear-gradient(${pool.angle}deg`,
    `${startColor} ${pool.startInsetPx}px`,
    `${coreColor} ${startCore}`,
    `${coreColor} ${endCore}`,
    `${endColor} calc(100% - ${pool.endInsetPx}px))`,
  ].join(", ");
}

/**
 * Create a Tier B renderer.
 *
 * @returns A {@link Renderer} whose `tier` is `"css"`.
 */
export function createCssRenderer(): Renderer {
  const pool = new NodePool<HTMLElement>();
  let container: HTMLElement | null = null;

  /** Style one line band from its geometry and the resolved options. */
  function styleBand(el: HTMLElement, line: MarkGeometry, context: RenderContext): void {
    const { box } = line;
    const { options } = context;
    const s = el.style;
    s.position = "absolute";
    s.left = `${box.x}px`;
    s.top = `${box.y}px`;
    s.width = `${box.width}px`;
    s.height = `${box.height}px`;
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
      let el = pool.get(line.seed);
      if (!el) {
        el = doc.createElement("div");
        el.setAttribute("aria-hidden", "true");
        container.appendChild(el);
        pool.set(line.seed, el);
      }
      styleBand(el, line, context);
    }

    // Release lines that no longer exist; survivors keep their identical node.
    pool.retain(keep, (el) => el.remove());
  }

  return {
    tier: "css",
    mount: render,
    update: render,
    unmount(): void {
      pool.clear((el) => el.remove());
      container = null;
    },
  };
}
