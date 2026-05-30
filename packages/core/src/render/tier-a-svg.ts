/**
 * Tier A renderer — the realistic SVG-filter band (blueprint R26 / A3 / R31).
 *
 * The default tier. Each visual line gets one absolutely-positioned **wrapper**
 * `<div>` placed at the line box; inside it, at `inset: 0`, sit the ink node (the
 * pool gradient, clipped to the chisel/bullet/fine geometry via
 * `clip-path: path(...)`, textured by the offset-sampled noise tile via
 * `mask-image`, run through a shared SVG filter) and an optional glow node. The
 * **wrapper carries no geometry clip-path** — only the box position — so the
 * draw-on animation can wipe it open with `clip-path: inset(...)` (a left-to-right
 * reveal of FIXED ink) instead of an `transform: scaleX()` that would stretch the
 * texture/wave (the wrapper's inset composes with the ink's own shape clip,
 * because each element clips its own subtree).
 *
 * The shared **single** `<svg>`/`<defs>` filter block
 * (`feTurbulence` + `feDisplacementMap` + `feMorphology` + `feGaussianBlur`) is
 * reused by every mark on the page rather than instantiating its own (R31). The
 * filters are referenced, never animated — they are computed once per geometry and
 * reused until reflow (R32), so scrolling never re-filters.
 *
 * An optional **additive** fluorescence layer (R16) is drawn as a second node in
 * `screen` blend over the multiply ink, so an enabled mark can read brighter and
 * more saturated than its background — modelling the Stokes shift, never merely a
 * darker tint, and never reducing text legibility.
 *
 * Nodes are pooled by stable line identity (the per-line seed) so reflow keeps
 * surviving lines' wrappers and their children (A14 §6 / R22d); `unmount()`
 * removes the overlay and leaves the DOM pristine (R9).
 */

import type { Renderer, RenderContext, MarkGeometry, ResolvedOptions } from "../types.js";
import { NodePool, applyBoxPosition, setVendorPrefixed, setStyleOnce } from "./renderer.js";
import { poolGradientToCss } from "./tier-b-css.js";

/** SVG namespace for `createElementNS`. */
const SVG_NS = "http://www.w3.org/2000/svg";

/** Id of the document-level shared `<svg>` holding the filter defs (R31). */
const SHARED_SVG_ID = "highlighters-shared-defs";

/**
 * Lazily create (or return) the document-level shared `<svg>`/`<defs>` block that
 * holds the turbulence/displacement/morphology/blur filters every Tier A mark
 * references (R31). The `<svg>` itself is zero-size, off-screen, and
 * `aria-hidden` — it contributes no layout and no paint of its own.
 *
 * Filters are **interned** into this single block by id (see {@link edgeFilterId}):
 * many marks share one filter when their feathering/flow quantize to the same
 * bucket, so the defs stay small while feathering can still visibly drive the
 * blur/dilation per mark. The `<svg>`/`<defs>` element is created once per
 * document and reused (the R31 invariant the tests assert).
 *
 * @param doc - The document to attach the shared defs to.
 * @returns The shared `<defs>` element.
 */
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

/** Quantize a 0–1 knob into one of `steps` buckets so filters can be interned. */
function quantize(value: number, steps: number): number {
  return Math.round(clamp01(value) * steps) / steps;
}

/**
 * Edge-filter parameters resolved from the ink/edge/paper knobs. `scale` is the
 * displacement fray (edge roughness/wave), `morph` the dilation that spreads the
 * bleed outward, and `blur` the soft feather — all in absolute px.
 */
interface EdgeFilterParams {
  scale: number;
  morph: number;
  blur: number;
}

/**
 * Resolve, then quantize, the per-mark edge-filter parameters from the resolved
 * options. The result is the source of truth both for the filter's id (so equal
 * params intern to one filter) and for its built primitives.
 *
 * - **feathering** drives the Gaussian `blur` stdDeviation and the `morph` dilate
 *   radius: high feathering = visibly blurrier, spread, bleeding edges.
 * - **flow** softens further (juicier ink reads softer/wider); **viscosity**
 *   sharpens (more viscous ink holds a crisper edge), so the two pull against
 *   each other on the same blur axis.
 * - **edge waviness/roughness** and paper absorbency raise the displacement fray.
 *
 * Returns `null` when nothing perturbs the edge (clean geometric band) so the mark
 * can skip the filter entirely.
 */
function resolveEdgeFilter(options: ResolvedOptions): EdgeFilterParams | null {
  const { edge, ink, paper } = options;

  // Soft feather axis: feathering is the dominant term; juicy flow adds softness,
  // viscosity removes it. Paper absorbency wicks the edge wider too.
  const softness =
    ink.feathering * 1.0 + ink.flow * 0.4 - ink.viscosity * 0.35 + paper.absorbency * 0.4;
  const blur = quantize(Math.max(0, softness), 8) * 4; // 0 .. 4px stdDeviation
  // Bleed dilation grows with feathering + absorbency; thin (low-flow) ink dilates
  // less so it stays skinny.
  const spread = ink.feathering * 0.8 + paper.absorbency * 0.5 + ink.flow * 0.25 - 0.15;
  const morph = quantize(Math.max(0, spread), 6) * 1.8; // 0 .. 1.8px dilate radius

  // Edge fray (displacement) from the wave + roughness; a wetter paper frays more.
  const frayRaw = edge.waviness * 0.8 + edge.roughness * 4 + paper.absorbency * 2;
  const scale = Math.min(8, Math.round(frayRaw * 2) / 2);

  if (blur <= 0 && morph <= 0 && scale <= 0) return null;
  return { scale, morph, blur };
}

/** A stable, collision-free id encoding the (quantized) edge-filter params. */
function edgeFilterId(p: EdgeFilterParams): string {
  const key = `${p.scale}-${p.morph}-${p.blur}`.replace(/\./g, "p");
  return `highlighters-edge-${key}`;
}

/**
 * Return the id of the edge filter for `params`, building and interning it into
 * the shared defs on first use (R31). Subsequent marks with params that quantize
 * to the same bucket reuse the same filter element.
 */
function ensureEdgeFilter(defs: SVGDefsElement, params: EdgeFilterParams): string {
  const id = edgeFilterId(params);
  const doc = defs.ownerDocument;
  if (!doc.getElementById(id)) {
    defs.appendChild(buildEdgeFilter(doc, id, params));
  }
  return id;
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
  params: EdgeFilterParams,
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
  // Seamless tiling so displaced edges never reveal a turbulence seam.
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

/**
 * Create a Tier A renderer.
 *
 * @returns A {@link Renderer} whose `tier` is `"svg"`.
 */
export function createSvgRenderer(): Renderer {
  // Per line: a positioned WRAPPER (the draw-on wipe surface, no geometry clip)
  // holding an ink node and, optionally, a glow node — all pooled by identity.
  const wrapperPool = new NodePool<HTMLElement>();
  const inkPool = new NodePool<HTMLElement>();
  const glowPool = new NodePool<HTMLElement>();
  let container: HTMLElement | null = null;

  /** Place a child node at `inset: 0` of its wrapper (fills the line box). */
  function fillWrapper(el: HTMLElement): void {
    const s = el.style;
    s.position = "absolute";
    s.left = "0";
    s.top = "0";
    s.width = "100%";
    s.height = "100%";
  }

  function styleInk(el: HTMLElement, line: MarkGeometry, context: RenderContext): void {
    const { options } = context;
    const { ink } = options;
    const s = el.style;
    fillWrapper(el);
    s.pointerEvents = "none";
    s.mixBlendMode = options.blendMode;

    // --- saturation × flow → effective ink alpha -----------------------------
    // saturation multiplies the deposited intensity (washed-out → bold); juicy
    // flow adds opacity on top, viscous ink subtracts it (drier, thinner).
    const saturationGain = 0.35 + 0.65 * clamp01(ink.saturation);
    const flowGain = 1 + 0.35 * (clamp01(ink.flow) - clamp01(ink.viscosity));
    const effectiveAlpha = clamp01(options.opacity * saturationGain * flowGain);
    s.opacity = String(round3(effectiveAlpha));

    setStyleOnce(el, "backgroundImage", poolGradientToCss(line.pool));
    s.backgroundRepeat = "no-repeat";
    // Absolute-px clip-path for the chisel/bullet/fine geometry (A14 §4).
    setVendorPrefixed(el, "clipPath", line.clipPath);
    // Offset-sampled, fixed-px, repeated noise tile (A14 §1) — the streak/pressure/
    // dryout texture, applied as a mask so the gradient shows through the grain and
    // breaks up where the tile thins out. The tile is sampled by offsetting the
    // window, never by rescaling it (R22c).
    setVendorPrefixed(el, "maskImage", `url("${line.noiseTile.dataUrl}")`);
    setVendorPrefixed(el, "maskRepeat", "repeat");
    setVendorPrefixed(el, "maskPosition", `${line.maskOffset.x}px ${line.maskOffset.y}px`);
    setVendorPrefixed(el, "maskSize", `${line.noiseTile.width}px ${line.noiseTile.height}px`);

    // --- feathering / flow / viscosity → soft-edge bleed filter --------------
    // Reference an interned shared filter; its blur/dilate scale with feathering
    // (and flow/viscosity), so dragging feathering up is visibly blurrier (R32:
    // referenced, never animated per frame).
    const doc = el.ownerDocument;
    const defs = getSharedDefs(doc);
    const filterParams = resolveEdgeFilter(options);
    setStyleOnce(el, "filter", filterParams ? `url(#${ensureEdgeFilter(defs, filterParams)})` : "");
  }

  function styleGlow(el: HTMLElement, line: MarkGeometry, context: RenderContext): void {
    const { glow, ink } = context.options;
    const s = el.style;
    fillWrapper(el);
    s.pointerEvents = "none";
    // Additive emission over the multiply ink (R16): screen blend + bloom, so the
    // mark can read brighter/more saturated than its background. Glow rides the
    // saturation knob too, so a bold mark glows brighter than a washed-out one.
    s.mixBlendMode = "screen";
    s.opacity = String(round3(clamp01(glow.intensity * (0.4 + 0.6 * clamp01(ink.saturation)))));
    s.backgroundColor = glow.color;
    setVendorPrefixed(el, "clipPath", line.clipPath);
    setStyleOnce(el, "filter", `blur(${glow.spread}px)`);
  }

  /** Get (or create, inside its wrapper) the pooled ink node for a line. */
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
    // Ensure the shared filter defs exist for this document (R31).
    getSharedDefs(doc);

    const glowEnabled = context.options.glow.enabled;
    const keep = new Set<number>();

    for (const line of context.lines) {
      keep.add(line.seed);

      // The wrapper carries ONLY the box position — never a geometry clip — so the
      // draw-on can wipe it open with `clip-path: inset(...)` without scaling the
      // ink. Its clip-path is left untouched here so an in-flight/primed reveal is
      // preserved across reflow (R22: reflow never re-animates).
      let wrapper = wrapperPool.get(line.seed);
      if (!wrapper) {
        wrapper = doc.createElement("div");
        wrapper.setAttribute("aria-hidden", "true");
        wrapper.style.pointerEvents = "none";
        container.appendChild(wrapper);
        wrapperPool.set(line.seed, wrapper);
      }
      applyBoxPosition(wrapper, line.box);

      const ink = ensureInk(doc, wrapper, line.seed);

      if (glowEnabled) {
        let glow = glowPool.get(line.seed);
        if (!glow) {
          glow = doc.createElement("div");
          glow.setAttribute("aria-hidden", "true");
          // Glow sits beneath the ink in DOM order so the ink's clip wins visually.
          wrapper.insertBefore(glow, ink);
          glowPool.set(line.seed, glow);
        }
        styleGlow(glow, line, context);
      }

      styleInk(ink, line, context);
    }

    // Reconcile: a vanished line's wrapper (and its ink/glow children) is removed
    // as a unit; surviving lines keep their exact wrapper subtree (R22d).
    wrapperPool.retain(keep, (el) => el.remove());
    inkPool.retain(keep, () => {});
    // Drop glow nodes for vanished lines, and all glow nodes if glow is now off.
    const glowKeep = glowEnabled ? keep : new Set<number>();
    glowPool.retain(glowKeep, (el) => el.remove());
  }

  return {
    tier: "svg",
    mount: render,
    update: render,
    bandFor: (seed: number): HTMLElement | null => wrapperPool.get(seed) ?? null,
    unmount(): void {
      // Removing each wrapper detaches its ink/glow children with it; clear the
      // child pools without re-removing (their nodes leave with the wrapper).
      wrapperPool.clear((el) => el.remove());
      inkPool.clear(() => {});
      glowPool.clear(() => {});
      container = null;
    },
  };
}

/** Clamp a value into `[0, 1]`. */
function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Round to 3 decimals so inline-style writes stay stable/compact. */
function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}
