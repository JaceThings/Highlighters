import type { Renderer, ResolvedOptions } from "../types.js";
import { clamp } from "../internal/math.js";
import { createBandRenderer, fillParent, hiddenDiv, setStyleOnce, setVendorPrefixed } from "./renderer.js";
import { poolGradientToCss } from "./tier-b-css.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const SHARED_SVG_ID = "highlighters-shared-defs";

function getSharedDefs(doc: Document): SVGDefsElement {
  const defs = doc.getElementById(SHARED_SVG_ID)?.querySelector<SVGDefsElement>("defs");
  if (defs) return defs;

  const svg = doc.createElementNS(SVG_NS, "svg");
  svg.setAttribute("id", SHARED_SVG_ID);
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("width", "0");
  svg.setAttribute("height", "0");
  const s = svg.style;
  s.position = "absolute";
  s.width = "0";
  s.height = "0";
  s.overflow = "hidden";
  s.pointerEvents = "none";

  const fresh = doc.createElementNS(SVG_NS, "defs");
  svg.appendChild(fresh);
  (doc.body ?? doc.documentElement).appendChild(svg);
  return fresh;
}

function quantize(value: number, steps: number): number {
  return Math.round(clamp(value, 0, 1) * steps) / steps;
}

function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}

interface EdgeFilterParams {
  scale: number;
  morph: number;
  blur: number;
}

function resolveEdgeFilter({ edge, ink, paper }: ResolvedOptions): EdgeFilterParams | null {
  const softness = ink.feathering + ink.flow * 0.4 - ink.viscosity * 0.35 + paper.absorbency * 0.4;
  const blur = quantize(Math.max(0, softness), 8) * 4;
  const spread = ink.feathering * 0.8 + paper.absorbency * 0.5 + ink.flow * 0.25 - 0.15;
  const morph = quantize(Math.max(0, spread), 6) * 1.8;
  const fray = edge.waviness * 0.8 + edge.roughness * 4 + paper.absorbency * 2;
  const scale = Math.min(8, Math.round(fray * 2) / 2);

  if (blur <= 0 && morph <= 0 && scale <= 0) return null;
  return { scale, morph, blur };
}

function ensureEdgeFilter(doc: Document, params: EdgeFilterParams): string {
  const id = `highlighters-edge-${`${params.scale}-${params.morph}-${params.blur}`.replace(/\./g, "p")}`;
  if (doc.getElementById(id)) return id;

  const el = (tag: string, attrs: Record<string, string>): Element => {
    const node = doc.createElementNS(SVG_NS, tag);
    for (const key in attrs) node.setAttribute(key, attrs[key]);
    return node;
  };

  const filter = el("filter", {
    id,
    x: "-20%",
    y: "-20%",
    width: "140%",
    height: "140%",
    filterUnits: "objectBoundingBox",
  });
  filter.appendChild(
    el("feTurbulence", {
      type: "fractalNoise",
      baseFrequency: "0.012 0.04",
      numOctaves: "2",
      seed: "7",
      stitchTiles: "stitch",
      result: "noise",
    }),
  );
  filter.appendChild(
    el("feDisplacementMap", {
      in: "SourceGraphic",
      in2: "noise",
      scale: String(params.scale),
      xChannelSelector: "R",
      yChannelSelector: "G",
      result: "displaced",
    }),
  );
  let last = "displaced";
  if (params.morph > 0) {
    filter.appendChild(
      el("feMorphology", { in: last, operator: "dilate", radius: String(params.morph), result: "bled" }),
    );
    last = "bled";
  }
  if (params.blur > 0) {
    filter.appendChild(el("feGaussianBlur", { in: last, stdDeviation: String(params.blur) }));
  }

  getSharedDefs(doc).appendChild(filter);
  return id;
}

export function createSvgRenderer(): Renderer {
  return createBandRenderer("svg", ({ container, options }, inkColor) => {
    const doc = container.ownerDocument;
    const { ink, glow } = options;
    const filterParams = resolveEdgeFilter(options);
    const filter = filterParams ? `url(#${ensureEdgeFilter(doc, filterParams)})` : "";
    const flowGain = 1 + 0.35 * (clamp(ink.flow, 0, 1) - clamp(ink.viscosity, 0, 1));
    const glowOpacity = String(round3(clamp(glow.intensity * 0.82, 0, 1)));

    return (wrapper, line) => {
      let inkEl = wrapper.lastElementChild as HTMLElement | null;
      if (!inkEl) wrapper.appendChild((inkEl = hiddenDiv(doc)));

      let glowEl = wrapper.firstElementChild === inkEl ? null : (wrapper.firstElementChild as HTMLElement);
      if (!glow.enabled) {
        glowEl?.remove();
      } else {
        if (!glowEl) wrapper.insertBefore((glowEl = hiddenDiv(doc)), inkEl);
        fillParent(glowEl);
        setStyleOnce(glowEl, "mix-blend-mode", "screen");
        setStyleOnce(glowEl, "opacity", glowOpacity);
        setStyleOnce(glowEl, "background-color", glow.color);
        setVendorPrefixed(glowEl, "clip-path", line.clipPath);
        setStyleOnce(glowEl, "filter", `blur(${glow.spread}px)`);
      }

      const alpha = clamp(options.opacity * 0.805 * flowGain * (line.pool.layerScale ?? 1), 0, 1);
      fillParent(inkEl);
      setStyleOnce(inkEl, "mix-blend-mode", options.blendMode);
      setStyleOnce(inkEl, "opacity", String(round3(alpha)));
      setStyleOnce(inkEl, "background-image", poolGradientToCss(line.pool, inkColor));
      setStyleOnce(inkEl, "background-repeat", "no-repeat");
      setVendorPrefixed(inkEl, "clip-path", line.clipPath);
      setStyleOnce(inkEl, "filter", filter);
    };
  });
}
