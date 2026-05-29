/**
 * Tier A renderer — the realistic SVG-filter band (blueprint R26 / A3 / R31).
 *
 * The default tier. Each visual line gets one absolutely-positioned `<div>`
 * carrying the pool gradient, clipped to the chisel/bullet/fine geometry via
 * `clip-path: path(...)`, textured by the offset-sampled noise tile via
 * `mask-image`, and run through a **single shared** `<svg>`/`<defs>` filter block
 * (`feTurbulence` + `feDisplacementMap` + `feMorphology` + `feGaussianBlur`) so
 * every mark on the page reuses one filter set rather than instantiating its own
 * (R31). The filters are referenced, never animated — they are computed once per
 * geometry and reused until reflow (R32), so scrolling never re-filters.
 *
 * An optional **additive** fluorescence layer (R16) is drawn as a second node in
 * `screen` blend over the multiply ink, so an enabled mark can read brighter and
 * more saturated than its background — modelling the Stokes shift, never merely a
 * darker tint, and never reducing text legibility.
 *
 * Nodes are pooled by stable line identity (the per-line seed) so reflow keeps
 * surviving lines' nodes (A14 §6 / R22d); `unmount()` removes the overlay and
 * leaves the DOM pristine (R9).
 */

import type { Renderer, RenderContext, MarkGeometry, ResolvedOptions } from "../types.js";
import { NodePool } from "./renderer.js";
import { poolGradientToCss } from "./tier-b-css.js";

/** SVG namespace for `createElementNS`. */
const SVG_NS = "http://www.w3.org/2000/svg";

/** Id of the document-level shared `<svg>` holding the filter defs (R31). */
const SHARED_SVG_ID = "highlighters-shared-defs";

/** Filter ids inside the shared defs — referenced by every Tier A band. */
const FILTER_ROUGH = "highlighters-edge-rough";
const FILTER_BLEED = "highlighters-edge-bleed";

/**
 * Lazily create (or return) the document-level shared `<svg>`/`<defs>` block that
 * holds the turbulence/displacement/morphology/blur filters every Tier A mark
 * references (R31). The `<svg>` itself is zero-size, off-screen, and
 * `aria-hidden` — it contributes no layout and no paint of its own.
 *
 * @param doc - The document to attach the shared defs to.
 * @returns The shared `<defs>` element (filters are appended on first creation).
 */
export function getSharedDefs(doc: Document): SVGDefsElement {
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
  defs.appendChild(buildEdgeFilter(doc, FILTER_ROUGH, { scale: 3, morph: 0, blur: 0 }));
  defs.appendChild(buildEdgeFilter(doc, FILTER_BLEED, { scale: 5, morph: 0.6, blur: 0.7 }));
  svg.appendChild(defs);
  (doc.body ?? doc.documentElement).appendChild(svg);
  return defs;
}

/**
 * Build one edge filter: a fixed-frequency `feTurbulence` driving a
 * `feDisplacementMap` (the fray), an optional `feMorphology` (the bleed dilation),
 * and an optional `feGaussianBlur` (the soft feather). `baseFrequency` and `seed`
 * are static — never animated per frame (R32). The displacement scale is in
 * absolute px, so the fray is resolution-independent (R22c).
 */
function buildEdgeFilter(
  doc: Document,
  id: string,
  params: { scale: number; morph: number; blur: number },
): SVGFilterElement {
  const filter = doc.createElementNS(SVG_NS, "filter");
  filter.setAttribute("id", id);
  // Generous region so the displaced/dilated edge isn't clipped by the filter box.
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

/** Choose which shared filter a mark uses, from its resolved edge/ink params. */
function filterIdFor(options: ResolvedOptions): string | null {
  const { edge, ink, paper } = options;
  const wantsBleed =
    ink.feathering > 0.45 || paper.absorbency > 0.5 || ink.flow > 0.7;
  const wantsFray = edge.waviness > 0 || edge.roughness > 0;
  if (wantsBleed) return FILTER_BLEED;
  if (wantsFray) return FILTER_ROUGH;
  return null;
}

/**
 * Create a Tier A renderer.
 *
 * @returns A {@link Renderer} whose `tier` is `"svg"`.
 */
export function createSvgRenderer(): Renderer {
  // Each line owns an ink node and (optionally) a glow node, pooled by identity.
  const inkPool = new NodePool<HTMLElement>();
  const glowPool = new NodePool<HTMLElement>();
  let container: HTMLElement | null = null;

  function styleInk(el: HTMLElement, line: MarkGeometry, context: RenderContext): void {
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
    s.backgroundImage = poolGradientToCss(line.pool);
    s.backgroundRepeat = "no-repeat";
    // Absolute-px clip-path for the chisel/bullet/fine geometry (A14 §4).
    s.clipPath = line.clipPath;
    (s as CSSStyleDeclaration & { webkitClipPath?: string }).webkitClipPath = line.clipPath;
    // Offset-sampled, fixed-px, repeated noise tile (A14 §1) — the streak/pressure
    // texture, applied as a mask so the gradient shows through the grain. The
    // tile is sampled by offsetting the window, never by rescaling it (R22c).
    s.maskImage = `url("${line.noiseTile.dataUrl}")`;
    (s as CSSStyleDeclaration & { webkitMaskImage?: string }).webkitMaskImage = `url("${line.noiseTile.dataUrl}")`;
    s.maskRepeat = "repeat";
    (s as CSSStyleDeclaration & { webkitMaskRepeat?: string }).webkitMaskRepeat = "repeat";
    s.maskPosition = `${line.maskOffset.x}px ${line.maskOffset.y}px`;
    (s as CSSStyleDeclaration & { webkitMaskPosition?: string }).webkitMaskPosition = `${line.maskOffset.x}px ${line.maskOffset.y}px`;
    s.maskSize = `${line.noiseTile.width}px ${line.noiseTile.height}px`;
    (s as CSSStyleDeclaration & { webkitMaskSize?: string }).webkitMaskSize = `${line.noiseTile.width}px ${line.noiseTile.height}px`;
    // Reference the shared filter (never recomputed on scroll, R32).
    const filterId = filterIdFor(options);
    s.filter = filterId ? `url(#${filterId})` : "";
  }

  function styleGlow(el: HTMLElement, line: MarkGeometry, context: RenderContext): void {
    const { box } = line;
    const { glow } = context.options;
    const s = el.style;
    s.position = "absolute";
    s.left = `${box.x}px`;
    s.top = `${box.y}px`;
    s.width = `${box.width}px`;
    s.height = `${box.height}px`;
    s.pointerEvents = "none";
    // Additive emission over the multiply ink (R16): screen blend + bloom, so the
    // mark can read brighter/more saturated than its background.
    s.mixBlendMode = "screen";
    s.opacity = String(glow.intensity);
    s.backgroundColor = glow.color;
    s.clipPath = line.clipPath;
    (s as CSSStyleDeclaration & { webkitClipPath?: string }).webkitClipPath = line.clipPath;
    s.filter = `blur(${glow.spread}px)`;
  }

  function render(context: RenderContext): void {
    container = context.container;
    const doc = container.ownerDocument;
    // Ensure the shared filter defs exist for this document (R31).
    getSharedDefs(doc);

    const glowEnabled = context.options.glow.enabled;
    const keep = new Set<number>();

    for (const line of context.lines) {
      keep.add(line.seed);

      let ink = inkPool.get(line.seed);
      if (!ink) {
        ink = doc.createElement("div");
        ink.setAttribute("aria-hidden", "true");
        container.appendChild(ink);
        inkPool.set(line.seed, ink);
      }

      if (glowEnabled) {
        let glow = glowPool.get(line.seed);
        if (!glow) {
          glow = doc.createElement("div");
          glow.setAttribute("aria-hidden", "true");
          // Glow sits beneath the ink in DOM order so the ink's clip wins visually.
          container.insertBefore(glow, ink);
          glowPool.set(line.seed, glow);
        }
        styleGlow(glow, line, context);
      }

      styleInk(ink, line, context);
    }

    inkPool.retain(keep, (el) => el.remove());
    // Drop glow nodes for vanished lines, and all glow nodes if glow is now off.
    glowPool.retain(glowEnabled ? keep : new Set<number>(), (el) => el.remove());
  }

  return {
    tier: "svg",
    mount: render,
    update: render,
    unmount(): void {
      inkPool.clear((el) => el.remove());
      glowPool.clear((el) => el.remove());
      container = null;
    },
  };
}
