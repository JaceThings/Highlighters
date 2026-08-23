import type { Renderer, RenderContext, MarkGeometry, ResolvedOptions, ColorValue } from "../types.js";
import { clamp } from "../internal/math.js";
import { NodePool, applyBoxPosition, setVendorPrefixed, setStyleOnce, backdropElement, resolveBlendTarget } from "./renderer.js";
import { poolGradientToCss } from "./tier-b-css.js";
import { effectiveInk } from "./blend.js";

const SVG_NS = "http://www.w3.org/2000/svg";

const SHARED_SVG_ID = "highlighters-shared-defs";

function getSharedDefs(doc: Document): SVGDefsElement {
  const existing = doc.getElementById(SHARED_SVG_ID);
  if (existing) {
    const defs = existing.querySelector("defs");
    if (defs) return defs as SVGDefsElement;
  }

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

  const defs = doc.createElementNS(SVG_NS, "defs");
  svg.appendChild(defs);
  (doc.body ?? doc.documentElement).appendChild(svg);
  return defs;
}

function quantize(value: number, steps: number): number {
  return Math.round(clamp(value, 0, 1) * steps) / steps;
}

interface EdgeFilterParams {
  scale: number;
  morph: number;
  blur: number;
}

function resolveEdgeFilter(options: ResolvedOptions): EdgeFilterParams | null {
  const { edge, ink, paper } = options;

  const softness =
    ink.feathering * 1.0 + ink.flow * 0.4 - ink.viscosity * 0.35 + paper.absorbency * 0.4;
  const blur = quantize(Math.max(0, softness), 8) * 4;
  const spread = ink.feathering * 0.8 + paper.absorbency * 0.5 + ink.flow * 0.25 - 0.15;
  const morph = quantize(Math.max(0, spread), 6) * 1.8;

  const frayRaw = edge.waviness * 0.8 + edge.roughness * 4 + paper.absorbency * 2;
  const scale = Math.min(8, Math.round(frayRaw * 2) / 2);

  if (blur <= 0 && morph <= 0 && scale <= 0) return null;
  return { scale, morph, blur };
}

function edgeFilterId(p: EdgeFilterParams): string {
  const key = `${p.scale}-${p.morph}-${p.blur}`.replace(/\./g, "p");
  return `highlighters-edge-${key}`;
}

function ensureEdgeFilter(defs: SVGDefsElement, params: EdgeFilterParams): string {
  const id = edgeFilterId(params);
  const doc = defs.ownerDocument;
  if (!doc.getElementById(id)) {
    defs.appendChild(buildEdgeFilter(doc, id, params));
  }
  return id;
}

function buildEdgeFilter(
  doc: Document,
  id: string,
  params: EdgeFilterParams,
): SVGFilterElement {
  const filter = doc.createElementNS(SVG_NS, "filter");
  filter.setAttribute("id", id);
  filter.setAttribute("x", "-20%");
  filter.setAttribute("y", "-20%");
  filter.setAttribute("width", "140%");
  filter.setAttribute("height", "140%");
  filter.setAttribute("filterUnits", "objectBoundingBox");

  const turb = doc.createElementNS(SVG_NS, "feTurbulence");
  turb.setAttribute("type", "fractalNoise");
  turb.setAttribute("baseFrequency", "0.012 0.04");
  turb.setAttribute("numOctaves", "2");
  turb.setAttribute("seed", "7");
  turb.setAttribute("stitchTiles", "stitch");
  turb.setAttribute("result", "noise");
  filter.appendChild(turb);

  const disp = doc.createElementNS(SVG_NS, "feDisplacementMap");
  disp.setAttribute("in", "SourceGraphic");
  disp.setAttribute("in2", "noise");
  disp.setAttribute("scale", String(params.scale));
  disp.setAttribute("xChannelSelector", "R");
  disp.setAttribute("yChannelSelector", "G");
  disp.setAttribute("result", "displaced");
  filter.appendChild(disp);

  let last = "displaced";
  if (params.morph > 0) {
    const morph = doc.createElementNS(SVG_NS, "feMorphology");
    morph.setAttribute("in", last);
    morph.setAttribute("operator", "dilate");
    morph.setAttribute("radius", String(params.morph));
    morph.setAttribute("result", "bled");
    filter.appendChild(morph);
    last = "bled";
  }
  if (params.blur > 0) {
    const blur = doc.createElementNS(SVG_NS, "feGaussianBlur");
    blur.setAttribute("in", last);
    blur.setAttribute("stdDeviation", String(params.blur));
    filter.appendChild(blur);
  }

  return filter;
}

export function createSvgRenderer(): Renderer {
  const wrapperPool = new NodePool<HTMLElement>();
  const inkPool = new NodePool<HTMLElement>();
  const glowPool = new NodePool<HTMLElement>();
  let container: HTMLElement | null = null;
  let blendLayer: HTMLElement | null = null;

  function fillWrapper(el: HTMLElement): void {
    setStyleOnce(el, "position", "absolute");
    setStyleOnce(el, "left", "0");
    setStyleOnce(el, "top", "0");
    setStyleOnce(el, "width", "100%");
    setStyleOnce(el, "height", "100%");
  }

  function styleInk(
    el: HTMLElement,
    line: MarkGeometry,
    context: RenderContext,
    filterValue: string,
    inkColor: ColorValue | undefined,
  ): void {
    const { options } = context;
    const { ink } = options;
    fillWrapper(el);
    setStyleOnce(el, "pointerEvents", "none");
    setStyleOnce(el, "mixBlendMode", options.blendMode);

    const flowGain = 1 + 0.35 * (clamp(ink.flow, 0, 1) - clamp(ink.viscosity, 0, 1));
    const effectiveAlpha = clamp(
      options.opacity * 0.805 * flowGain * (line.pool.layerScale ?? 1),
      0,
      1,
    );
    setStyleOnce(el, "opacity", String(round3(effectiveAlpha)));

    setStyleOnce(el, "backgroundImage", poolGradientToCss(line.pool, inkColor));
    setStyleOnce(el, "backgroundRepeat", "no-repeat");
    setVendorPrefixed(el, "clipPath", line.clipPath);
    setVendorPrefixed(el, "maskImage", `url("${line.noiseTile.dataUrl}")`);
    setVendorPrefixed(el, "maskRepeat", "repeat");
    setVendorPrefixed(el, "maskPosition", `${line.maskOffset.x}px ${line.maskOffset.y}px`);
    setVendorPrefixed(el, "maskSize", `${line.noiseTile.width}px ${line.noiseTile.height}px`);

    setStyleOnce(el, "filter", filterValue);
  }

  function styleGlow(el: HTMLElement, line: MarkGeometry, context: RenderContext): void {
    const { glow } = context.options;
    fillWrapper(el);
    setStyleOnce(el, "pointerEvents", "none");
    setStyleOnce(el, "mixBlendMode", "screen");
    setStyleOnce(el, "opacity", String(round3(clamp(glow.intensity * 0.82, 0, 1))));
    setStyleOnce(el, "backgroundColor", glow.color);
    setVendorPrefixed(el, "clipPath", line.clipPath);
    setStyleOnce(el, "filter", `blur(${glow.spread}px)`);
  }

  function ensureInk(doc: Document, wrapper: HTMLElement, seed: number): HTMLElement {
    let ink = inkPool.get(seed);
    if (!ink) {
      ink = doc.createElement("div");
      ink.setAttribute("aria-hidden", "true");
      wrapper.appendChild(ink);
      inkPool.set(seed, ink);
    }
    return ink;
  }

  function render(context: RenderContext): void {
    container = context.container;
    const doc = container.ownerDocument;
    const plan = effectiveInk(context.options.blendMode, context.options.color, backdropElement(context), doc, context.options.vivid);
    const { target, layer } = resolveBlendTarget(container.parentElement, container, blendLayer, plan.layer);
    blendLayer = layer;
    const inkColor = plan.color === context.options.color ? undefined : plan.color;
    const defs = getSharedDefs(doc);
    const filterParams = resolveEdgeFilter(context.options);
    const filterValue = filterParams ? `url(#${ensureEdgeFilter(defs, filterParams)})` : "";

    const glowEnabled = context.options.glow.enabled;
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

      const ink = ensureInk(doc, wrapper, line.seed);

      if (glowEnabled) {
        let glow = glowPool.get(line.seed);
        if (!glow) {
          glow = doc.createElement("div");
          glow.setAttribute("aria-hidden", "true");
          wrapper.insertBefore(glow, ink);
          glowPool.set(line.seed, glow);
        }
        styleGlow(glow, line, context);
      }

      styleInk(ink, line, context, filterValue, inkColor);
    }

    wrapperPool.retain(keep, (el) => el.remove());
    inkPool.retain(keep, () => {});
    const glowKeep = glowEnabled ? keep : new Set<number>();
    glowPool.retain(glowKeep, (el) => el.remove());
  }

  return {
    tier: "svg",
    mount: render,
    update: render,
    bandFor: (seed: number): HTMLElement | null => wrapperPool.get(seed) ?? null,
    unmount(): void {
      wrapperPool.clear((el) => el.remove());
      inkPool.clear(() => {});
      glowPool.clear(() => {});
      blendLayer?.remove();
      blendLayer = null;
      container = null;
    },
  };
}

function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}
