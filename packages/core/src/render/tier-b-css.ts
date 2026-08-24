import type { Renderer, RenderContext, MarkGeometry, PoolGradient, ColorValue } from "../types.js";
import { NodePool, applyBoxPosition, backdropElement, resolveBlendTarget, setStyleOnce } from "./renderer.js";
import { effectiveInk } from "./blend.js";

export function poolGradientToCss(pool: PoolGradient, colorOverride?: ColorValue): string {
  const stops = pool.stops;
  let maxAlpha = 0;
  for (const s of stops) maxAlpha = Math.max(maxAlpha, s.opacity ?? 1);

  const fill = (i: number): string => {
    const stop = stops[i] ?? stops[0];
    const rel = maxAlpha > 0 ? (stop?.opacity ?? 1) / maxAlpha : 1;
    const color = colorOverride ?? stop?.color ?? "transparent";
    return `color-mix(in srgb, ${color} ${Math.round(rel * 100)}%, transparent)`;
  };

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

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function createCssRenderer(): Renderer {
  const wrapperPool = new NodePool<HTMLElement>();
  const bandPool = new NodePool<HTMLElement>();
  let container: HTMLElement | null = null;
  let blendLayer: HTMLElement | null = null;

  function styleBand(
    el: HTMLElement,
    line: MarkGeometry,
    context: RenderContext,
    inkColor: ColorValue | undefined,
  ): void {
    const { options } = context;
    setStyleOnce(el, "position", "absolute");
    setStyleOnce(el, "left", "0");
    setStyleOnce(el, "top", "0");
    setStyleOnce(el, "width", "100%");
    setStyleOnce(el, "height", "100%");
    setStyleOnce(el, "pointer-events", "none");
    setStyleOnce(el, "mix-blend-mode", options.blendMode);
    setStyleOnce(el, "opacity", String(options.opacity * (line.pool.layerScale ?? 1)));
    setStyleOnce(el, "background-image", poolGradientToCss(line.pool, inkColor));
    setStyleOnce(el, "background-repeat", "no-repeat");
    setStyleOnce(el, "box-decoration-break", "clone");
    setStyleOnce(el, "border-radius", `${options.edge.radius}px`);
  }

  function render(context: RenderContext): void {
    container = context.container;
    const doc = container.ownerDocument;
    const plan = effectiveInk(context.options.blendMode, context.options.color, backdropElement(context), doc, context.options.vivid);
    const { target, layer } = resolveBlendTarget(container.parentElement, container, blendLayer, plan.layer);
    blendLayer = layer;
    const inkColor = plan.color === context.options.color ? undefined : plan.color;
    const keep = new Set<number>();

    for (const line of context.lines) {
      keep.add(line.seed);
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
