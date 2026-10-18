import type { Renderer, PoolGradient, ColorValue } from "../types.js";
import { createBandRenderer, fillParent, hiddenDiv, setStyleOnce } from "./renderer.js";

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

  const parts = [`linear-gradient(${pool.angle}deg`, `${fill(0)} ${pool.startInsetPx}px`];
  const positions = pool.coreStopsPositionsPx;
  if (positions) {
    for (let i = 0; i < positions.length; i++) {
      parts.push(`${fill(i + 1)} ${Math.round(positions[i] * 100) / 100}px`);
    }
    parts.push(`${fill(stops.length - 1)} calc(100% - ${pool.endInsetPx}px))`);
  } else {
    parts.push(
      `${fill(1)} min(${pool.startCorePx}px, ${pool.startCorePct}%)`,
      `${fill(2)} max(calc(100% - ${pool.endCorePx}px), ${pool.endCorePct}%)`,
      `${fill(3)} calc(100% - ${pool.endInsetPx}px))`,
    );
  }
  return parts.join(", ");
}

export function createCssRenderer(): Renderer {
  return createBandRenderer("css", ({ options }, inkColor) => (wrapper, line) => {
    let band = wrapper.firstElementChild as HTMLElement | null;
    if (!band) wrapper.appendChild((band = hiddenDiv(wrapper.ownerDocument)));
    fillParent(band);
    setStyleOnce(band, "mix-blend-mode", options.blendMode);
    setStyleOnce(band, "opacity", String(options.opacity * (line.pool.layerScale ?? 1)));
    setStyleOnce(band, "background-image", poolGradientToCss(line.pool, inkColor));
    setStyleOnce(band, "background-repeat", "no-repeat");
    setStyleOnce(band, "box-decoration-break", "clone");
    setStyleOnce(band, "border-radius", `${options.edge.radius}px`);
  });
}
