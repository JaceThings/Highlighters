/**
 * Capability detection and renderer-tier selection (blueprint R27 / A3).
 *
 * Three tiers sit behind one API and degrade is fidelity-only — a lower tier never
 * moves or recolours a mark, only simplifies edge organicness and texture (A3 / R28).
 *
 *  - {@link detectEnvironment} — runtime support + accessibility/data preferences.
 *    SSR-guarded: touches no DOM at import, returns conservative defaults off-browser.
 *  - {@link selectTier} — given a request, the environment, and the live mark count,
 *    pick a concrete tier. A pinned request is honoured if supported (else steps
 *    down to the nearest supported); `"auto"` applies the degrade precedence.
 */

import type {
  RenderEnvironment,
  RendererTier,
  RendererTierPreference,
} from "../types.js";
import { hasMediaQueries } from "../internal/dom.js";

/**
 * Mark count above which Tier A auto-degrades to Tier B under `auto` (R27 §2 / R31):
 * past this many simultaneous SVG-filter marks, the CSS band protects the frame rate.
 */
export const DEFAULT_DEGRADE_THRESHOLD = 50;

/** Tier order from highest fidelity to the universal floor. */
const TIER_ORDER: readonly RendererTier[] = ["svg", "css", "highlight-api"];

/** Conservative environment for import time and off-browser (R34): nothing assumed. */
const SSR_ENVIRONMENT: RenderEnvironment = {
  supportsSvgFilters: false,
  supportsCssBlend: false,
  supportsHighlightApi: false,
  prefersReducedMotion: false,
  prefersReducedData: false,
  coarsePointer: false,
  degradeThreshold: DEFAULT_DEGRADE_THRESHOLD,
};

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
 * Tier A needs `clip-path`, `mask-image`, and SVG filter primitives. Some engines
 * report these inconsistently, so test the CSS props directly and treat
 * `SVGFETurbulenceElement` presence as the filter-support signal.
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
 * Feature-detect the tiers and read motion/data/pointer preferences into a
 * {@link RenderEnvironment}. SSR-safe (R34); DOM-pure (reads, never writes).
 */
export function detectEnvironment(): RenderEnvironment {
  if (!hasMediaQueries()) return SSR_ENVIRONMENT;

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
 * First supported tier at or below `start`, else any supported tier, else `css`
 * (the floor) — so the selector always yields a concrete tier (C1: below the floor
 * the renderer itself fails safe by drawing nothing).
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
  // Wrap to find any supported tier above `start`.
  for (const tier of TIER_ORDER) {
    if (tierSupported(tier, env)) return tier;
  }
  return "css";
}

/**
 * Select the concrete renderer tier to draw a mark with.
 *
 * - Pinned (`!== "auto"`): honour the request when supported (no auto-degrade,
 *   R27), else step down to the nearest supported tier so a pin still renders.
 * - `"auto"`: apply the degrade precedence —
 *     1. reduced-motion / reduced-data step SVG down to the CSS band;
 *     2. `markCount` above the threshold steps Tier A down to Tier B (R31);
 *     3. an unsupported tier falls through to the next supported.
 *   Tier B is the floor of auto-degrade; Tier C is chosen only when highest
 *   supported or explicitly pinned.
 *
 * Pure given its inputs — all capability reads happen in {@link detectEnvironment}.
 *
 * @param markCount - Number of simultaneously visible marks (for the threshold).
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

  // Start from the highest supported tier, then apply degrade rules.
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
