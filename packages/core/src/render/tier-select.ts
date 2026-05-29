/**
 * Capability detection and renderer-tier selection (blueprint R27 / A3).
 *
 * Three tiers sit behind one API and degrade is **fidelity-only** — selecting a
 * lower tier never moves or recolours a mark, it only simplifies the edge
 * organicness and texture (A3 / R28). This module answers two questions:
 *
 *  - {@link detectEnvironment} — what does the current runtime support, and what
 *    accessibility/data preferences are set? Guarded for SSR: it touches no DOM at
 *    import and returns conservative defaults when called outside a browser.
 *  - {@link selectTier} — given a request, the environment, and the live mark
 *    count, which concrete tier do we draw with? A pinned (`!== "auto"`) request
 *    is honoured if supported (and otherwise steps down to the nearest supported
 *    tier), while `"auto"` applies the documented degrade precedence.
 */

import type {
  RenderEnvironment,
  RendererTier,
  RendererTierPreference,
} from "../types.js";

/**
 * Default mark count above which Tier A auto-degrades to Tier B under `auto`
 * (R27 §2 / R31). Calibrated against the performance budget — past this many
 * simultaneous SVG-filter marks, the lighter CSS band protects the frame rate.
 */
export const DEFAULT_DEGRADE_THRESHOLD = 50;

/** Tier order from highest fidelity to the universal floor. */
const TIER_ORDER: readonly RendererTier[] = ["svg", "css", "highlight-api"];

/**
 * Conservative environment used at import time and outside a browser (R34): no
 * advanced features, no motion/data preferences, fine pointer, default
 * threshold. Importing the library must never assume a DOM exists.
 */
const SSR_ENVIRONMENT: RenderEnvironment = {
  supportsSvgFilters: false,
  supportsCssBlend: false,
  supportsHighlightApi: false,
  prefersReducedMotion: false,
  prefersReducedData: false,
  coarsePointer: false,
  degradeThreshold: DEFAULT_DEGRADE_THRESHOLD,
};

/** Whether a usable DOM (with `document` and `window.CSS.supports`) is present. */
function hasDom(): boolean {
  return (
    typeof document !== "undefined" &&
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function"
  );
}

/** Safe `CSS.supports(decl, value)` that never throws on old engines. */
function cssSupports(declaration: string, value: string): boolean {
  if (typeof CSS === "undefined" || typeof CSS.supports !== "function") {
    return false;
  }
  try {
    return CSS.supports(declaration, value);
  } catch {
    return false;
  }
}

/** Safe `matchMedia(query).matches`, `false` when the query is unparseable. */
function mediaMatches(query: string): boolean {
  try {
    return window.matchMedia(query).matches;
  } catch {
    return false;
  }
}

/**
 * Tier A needs `clip-path` (for the chisel/bullet/fine geometry), `mask-image`
 * (for the offset-sampled noise tile), and SVG filter primitives. happy-dom and
 * older engines report these inconsistently, so we test the CSS props directly
 * and treat `SVGFETurbulenceElement` presence as the filter-support signal.
 */
function detectSvgFilters(): boolean {
  const clip =
    cssSupports("clip-path", "path('M0 0')") ||
    cssSupports("clip-path", "inset(0)") ||
    cssSupports("-webkit-clip-path", "inset(0)");
  const mask =
    cssSupports("mask-image", "none") ||
    cssSupports("-webkit-mask-image", "none");
  const filters = typeof SVGFETurbulenceElement !== "undefined";
  return clip && mask && filters;
}

/** Tier B needs `mix-blend-mode` and `box-decoration-break` (the CSS band). */
function detectCssBlend(): boolean {
  const blend = cssSupports("mix-blend-mode", "multiply");
  const clone =
    cssSupports("box-decoration-break", "clone") ||
    cssSupports("-webkit-box-decoration-break", "clone");
  return blend && clone;
}

/** Tier C needs the CSS Custom Highlight API (`CSS.highlights` + `Highlight`). */
function detectHighlightApi(): boolean {
  return (
    typeof CSS !== "undefined" &&
    "highlights" in CSS &&
    typeof Highlight !== "undefined"
  );
}

/**
 * Feature-detect the renderer tiers and read the user's motion/data/pointer
 * preferences into a {@link RenderEnvironment}.
 *
 * SSR-safe: returns {@link SSR_ENVIRONMENT} without touching the DOM when no
 * browser environment is present (R34). Pure with respect to the DOM — it only
 * reads, never writes.
 *
 * @returns A capability + preference snapshot for {@link selectTier}.
 */
export function detectEnvironment(): RenderEnvironment {
  if (!hasDom()) return SSR_ENVIRONMENT;

  return {
    supportsSvgFilters: detectSvgFilters(),
    supportsCssBlend: detectCssBlend(),
    supportsHighlightApi: detectHighlightApi(),
    prefersReducedMotion: mediaMatches("(prefers-reduced-motion: reduce)"),
    prefersReducedData: mediaMatches("(prefers-reduced-data: reduce)"),
    coarsePointer:
      mediaMatches("(pointer: coarse)") || mediaMatches("(hover: none)"),
    degradeThreshold: DEFAULT_DEGRADE_THRESHOLD,
  };
}

/** Whether `env` reports support for a given concrete tier. */
function tierSupported(tier: RendererTier, env: RenderEnvironment): boolean {
  switch (tier) {
    case "svg":
      return env.supportsSvgFilters;
    case "css":
      return env.supportsCssBlend;
    case "highlight-api":
      return env.supportsHighlightApi;
  }
}

/**
 * Walk down the tier order from `start` and return the first supported tier.
 * Falls back to `css` (the universal floor) if nothing below reports support, so
 * the selector always yields a concrete tier rather than throwing (C1: below the
 * floor the renderer itself fails safe by drawing nothing).
 */
function firstSupportedFrom(
  start: RendererTier,
  env: RenderEnvironment,
): RendererTier {
  const startIndex = TIER_ORDER.indexOf(start);
  for (let i = startIndex; i < TIER_ORDER.length; i++) {
    const tier = TIER_ORDER[i]!;
    if (tierSupported(tier, env)) return tier;
  }
  // Wrap to find any supported tier above `start`, else default to the floor.
  for (const tier of TIER_ORDER) {
    if (tierSupported(tier, env)) return tier;
  }
  return "css";
}

/**
 * Select the concrete renderer tier to draw a mark with.
 *
 * - **Pinned** (`requested !== "auto"`): honour the request when supported (no
 *   auto-degrade, R27), otherwise step down to the nearest supported tier so a
 *   pin on an unsupported feature still renders rather than failing.
 * - **`"auto"`**: apply the degrade precedence —
 *     1. `prefers-reduced-motion` / `prefers-reduced-data` force a step down from
 *        the realistic SVG tier to the lightweight CSS band;
 *     2. a live `markCount` above `env.degradeThreshold` steps Tier A down to
 *        Tier B for the performance budget (R31);
 *     3. a tier whose APIs are unavailable falls through to the next supported
 *        tier.
 *   Tier B (`css`) is the floor of auto-degrade; Tier C is only chosen when it is
 *   the highest supported tier or explicitly pinned.
 *
 * Pure given its inputs (no DOM access) — all capability reads happen in
 * {@link detectEnvironment}.
 *
 * @param requested - The consumer's tier preference / pin.
 * @param env - The detected capability + preference snapshot.
 * @param markCount - Number of simultaneously visible marks (for the threshold).
 * @returns The concrete tier to render with.
 */
export function selectTier(
  requested: RendererTierPreference,
  env: RenderEnvironment,
  markCount: number,
): RendererTier {
  if (requested !== "auto") {
    return tierSupported(requested, env)
      ? requested
      : firstSupportedFrom(requested, env);
  }

  // Auto: start from the highest supported tier, then apply degrade rules.
  let tier = firstSupportedFrom("svg", env);

  if (tier === "svg") {
    const degradeForPreference =
      env.prefersReducedMotion || env.prefersReducedData;
    const degradeForCount = markCount > env.degradeThreshold;
    if (degradeForPreference || degradeForCount) {
      tier = firstSupportedFrom("css", env);
    }
  }

  return tier;
}
