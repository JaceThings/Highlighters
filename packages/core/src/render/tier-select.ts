import type {
  RenderEnvironment,
  RendererTier,
  RendererTierPreference,
} from "../types.js";
import { hasGlobal, hasMediaQueries } from "../internal/dom.js";

export const DEFAULT_DEGRADE_THRESHOLD = 50;

const TIER_ORDER: readonly RendererTier[] = ["svg", "css", "highlight-api"];

const SSR_ENVIRONMENT: RenderEnvironment = {
  supportsSvgFilters: false,
  supportsCssBlend: false,
  supportsHighlightApi: false,
  prefersReducedMotion: false,
  prefersReducedData: false,
  coarsePointer: false,
  degradeThreshold: DEFAULT_DEGRADE_THRESHOLD,
};

function cssSupports(declaration: string, value: string): boolean {
  if (!hasGlobal("CSS") || !("supports" in CSS)) {
    return false;
  }
  try {
    return CSS.supports(declaration, value);
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

function detectSvgFilters(): boolean {
  const clip =
    cssSupports("clip-path", "path('M0 0')") ||
    cssSupports("clip-path", "inset(0)") ||
    cssSupports("-webkit-clip-path", "inset(0)");
  const mask =
    cssSupports("mask-image", "none") ||
    cssSupports("-webkit-mask-image", "none");
  return clip && mask && hasGlobal("SVGFETurbulenceElement");
}

function detectCssBlend(): boolean {
  const blend = cssSupports("mix-blend-mode", "multiply");
  const clone =
    cssSupports("box-decoration-break", "clone") ||
    cssSupports("-webkit-box-decoration-break", "clone");
  return blend && clone;
}

function detectHighlightApi(): boolean {
  return hasGlobal("CSS") && "highlights" in CSS && hasGlobal("Highlight");
}

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

function firstSupportedFrom(
  start: RendererTier,
  env: RenderEnvironment,
): RendererTier {
  const startIndex = TIER_ORDER.indexOf(start);
  for (let i = startIndex; i < TIER_ORDER.length; i++) {
    const tier = TIER_ORDER[i]!;
    if (tierSupported(tier, env)) return tier;
  }
  for (const tier of TIER_ORDER) {
    if (tierSupported(tier, env)) return tier;
  }
  return "css";
}

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

  let tier = firstSupportedFrom("svg", env);

  if (tier === "svg") {
    const degrade =
      env.prefersReducedMotion ||
      env.prefersReducedData ||
      markCount > env.degradeThreshold;
    if (degrade) tier = firstSupportedFrom("css", env);
  }

  return tier;
}
