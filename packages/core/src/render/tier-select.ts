import type { RenderEnvironment, RendererTier, RendererTierPreference } from "../types.js";
import { hasDom, hasGlobal } from "../internal/dom.js";

export const DEFAULT_DEGRADE_THRESHOLD = 50;

const TIER_ORDER: readonly RendererTier[] = ["svg", "css", "highlight-api"];

const SUPPORT_FLAG: Record<RendererTier, keyof RenderEnvironment> = {
  svg: "supportsSvgFilters",
  css: "supportsCssBlend",
  "highlight-api": "supportsHighlightApi",
};

const SSR_ENVIRONMENT: RenderEnvironment = {
  supportsSvgFilters: false,
  supportsCssBlend: false,
  supportsHighlightApi: false,
  prefersReducedMotion: false,
  prefersReducedData: false,
  coarsePointer: false,
  degradeThreshold: DEFAULT_DEGRADE_THRESHOLD,
};

function cssSupports(property: string, value: string): boolean {
  try {
    return hasGlobal("CSS") && CSS.supports(property, value);
  } catch {
    return false;
  }
}

function mediaMatches(query: string): boolean {
  try {
    return window.matchMedia(query).matches;
  } catch {
    return false;
  }
}

export function detectHighlightApi(): boolean {
  return hasGlobal("CSS") && "highlights" in CSS && hasGlobal("Highlight");
}

export function detectEnvironment(): RenderEnvironment {
  if (!hasDom() || !("matchMedia" in window)) return SSR_ENVIRONMENT;

  const clip =
    cssSupports("clip-path", "path('M0 0')") ||
    cssSupports("clip-path", "inset(0)") ||
    cssSupports("-webkit-clip-path", "inset(0)");
  const clone =
    cssSupports("box-decoration-break", "clone") ||
    cssSupports("-webkit-box-decoration-break", "clone");

  return {
    supportsSvgFilters: clip && hasGlobal("SVGFETurbulenceElement"),
    supportsCssBlend: cssSupports("mix-blend-mode", "multiply") && clone,
    supportsHighlightApi: detectHighlightApi(),
    prefersReducedMotion: mediaMatches("(prefers-reduced-motion: reduce)"),
    prefersReducedData: mediaMatches("(prefers-reduced-data: reduce)"),
    coarsePointer: mediaMatches("(pointer: coarse)") || mediaMatches("(hover: none)"),
    degradeThreshold: DEFAULT_DEGRADE_THRESHOLD,
  };
}

function firstSupportedFrom(start: RendererTier, env: RenderEnvironment): RendererTier {
  const from = TIER_ORDER.indexOf(start);
  for (let i = 0; i < TIER_ORDER.length; i++) {
    const tier = TIER_ORDER[(from + i) % TIER_ORDER.length];
    if (env[SUPPORT_FLAG[tier]]) return tier;
  }
  return "css";
}

export function selectTier(
  requested: RendererTierPreference,
  env: RenderEnvironment,
  markCount: number,
): RendererTier {
  if (requested !== "auto") return firstSupportedFrom(requested, env);
  const degrade =
    env.prefersReducedMotion || env.prefersReducedData || markCount > env.degradeThreshold;
  return firstSupportedFrom(degrade ? "css" : "svg", env);
}
