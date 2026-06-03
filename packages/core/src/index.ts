/**
 * `@highlighters/core` — the framework-agnostic public API.
 *
 * One pipeline, many front doors (blueprint A2): every targeting input
 * normalizes to a set of DOM `Range`s, then to per-visual-line rectangles, then
 * to absolute-px geometry, then to the selected renderer tier. This barrel
 * re-exports the complete public surface — the four entry points, the config
 * resolution helpers, the curated palettes/presets, and the lower-level
 * geometry/targeting/render primitives — plus every public type.
 *
 * The DOM-free subset (pure geometry + config + types) is also available from
 * the SSR-safe `@highlighters/core/path` entry, which imports nothing here that
 * touches `window`/`document`.
 */

// --- Entry points -----------------------------------------------------------
export { highlight, highlightAll, highlightSelection, group } from "./render/highlight.js";

// --- Configuration ----------------------------------------------------------
export { resolveOptions, mergeOptions } from "./config/merge.js";
export { DEFAULT_OPTIONS } from "./config/defaults.js";
export { PRESETS, getPreset } from "./config/presets.js";
export { PALETTES, getPalette, resolveSwatch, defaultSwatch } from "./config/palettes.js";

// --- Geometry (absolute-px mark-space, all pure / SSR-safe) ------------------
export { buildMarkGeometry } from "./geometry/mark-space.js";
export { buildClipPath } from "./geometry/clip-path.js";
export { buildEdge } from "./geometry/edges.js";
export { buildNoiseTile, buildNoiseTileDataUrl } from "./geometry/noise-tile.js";
export { buildPoolGradient } from "./geometry/pool.js";
export { hashJitter, hashU32, mulberry } from "./geometry/rng.js";
export { snapRangeToBounds } from "./geometry/snap.js";

// --- Targeting --------------------------------------------------------------
export { toRanges } from "./targeting/normalize.js";
export { rangesToLineRects, computeAnchor } from "./targeting/line-rects.js";
export { collectPageRanges } from "./targeting/include-exclude.js";
export { findTextRanges } from "./targeting/text-search.js";
export { createReflowObserver, createMutationWatcher } from "./targeting/observers.js";

// --- Render -----------------------------------------------------------------
export { detectEnvironment, selectTier } from "./render/tier-select.js";
export { createSvgRenderer } from "./render/tier-a-svg.js";
export { createCssRenderer } from "./render/tier-b-css.js";
export { createHighlightApiRenderer } from "./render/tier-c-highlight-api.js";

// --- Public types -----------------------------------------------------------
export type {
  // Scalars and small unions
  ColorValue,
  MarkType,
  ShapeType,
  TipType,
  EdgeCap,
  BlendMode,
  SnapMode,
  RendererTierPreference,
  RendererTier,
  AnimationDirection,
  AnimationTrigger,
  EasingValue,
  // Color, gradient, palettes, presets
  GradientStop,
  GradientConfig,
  PaletteName,
  PaletteSwatch,
  Palette,
  PresetName,
  // Namespaced option groups
  TipOptions,
  InkOptions,
  SpeedDynamicsOptions,
  EdgeOptions,
  PaperOptions,
  GlowOptions,
  AnimationOptions,
  // The user-facing options object and resolved form
  HighlightOptions,
  ResolvedTip,
  ResolvedInk,
  ResolvedSpeedDynamics,
  ResolvedEdge,
  ResolvedPaper,
  ResolvedGlow,
  ResolvedAnimation,
  ResolvedOptions,
  LineSpeedProfile,
  // Geometry (absolute-px mark-space)
  Box,
  LineRect,
  Anchor,
  EdgeVertex,
  PoolGradient,
  NoiseTile,
  MaskOffset,
  MarkGeometry,
  // DOM-touching targeting/handle/renderer types
  PageTarget,
  TextTarget,
  Target,
  MarkHandle,
  GroupHandle,
  RenderEnvironment,
  Renderer,
  RenderContext,
  // Function-signature types
  ReflowCallback,
  MutationCallback,
  Disconnect,
} from "./types.js";
