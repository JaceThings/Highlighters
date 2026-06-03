/**
 * `@highlighters/core` — the framework-agnostic public API.
 *
 * One pipeline, many front doors: every targeting input normalizes to DOM
 * `Range`s, then per-visual-line rectangles, then absolute-px geometry, then the
 * selected renderer tier. The DOM-free subset (pure geometry + config + types) is
 * also available from the SSR-safe `@highlighters/core/path` entry.
 */

export { highlight, highlightAll, highlightSelection, group } from "./render/highlight.js";

export { resolveOptions, mergeOptions } from "./config/merge.js";
export { DEFAULT_OPTIONS } from "./config/defaults.js";
export { PRESETS, getPreset } from "./config/presets.js";
export { PALETTES, getPalette, resolveSwatch, defaultSwatch } from "./config/palettes.js";

export { buildMarkGeometry } from "./geometry/mark-space.js";
export { buildClipPath } from "./geometry/clip-path.js";
export { buildEdge } from "./geometry/edges.js";
export { buildNoiseTile, buildNoiseTileDataUrl } from "./geometry/noise-tile.js";
export { buildPoolGradient } from "./geometry/pool.js";
export { hashJitter, hashU32, mulberry } from "./geometry/rng.js";
export { snapRangeToBounds } from "./geometry/snap.js";

export { toRanges } from "./targeting/normalize.js";
export { rangesToLineRects, computeAnchor } from "./targeting/line-rects.js";
export { collectPageRanges } from "./targeting/include-exclude.js";
export { findTextRanges } from "./targeting/text-search.js";
export { createReflowObserver, createMutationWatcher } from "./targeting/observers.js";

export { detectEnvironment, selectTier } from "./render/tier-select.js";
export { createSvgRenderer } from "./render/tier-a-svg.js";
export { createCssRenderer } from "./render/tier-b-css.js";
export { createHighlightApiRenderer } from "./render/tier-c-highlight-api.js";

export type {
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
  GradientStop,
  GradientConfig,
  PaletteName,
  PaletteSwatch,
  Palette,
  PresetName,
  TipOptions,
  InkOptions,
  SpeedDynamicsOptions,
  EdgeOptions,
  PaperOptions,
  GlowOptions,
  AnimationOptions,
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
  Box,
  LineRect,
  Anchor,
  EdgeVertex,
  PoolGradient,
  NoiseTile,
  MaskOffset,
  MarkGeometry,
  PageTarget,
  TextTarget,
  Target,
  MarkHandle,
  GroupHandle,
  RenderEnvironment,
  Renderer,
  RenderContext,
  ReflowCallback,
  MutationCallback,
  Disconnect,
} from "./types.js";
