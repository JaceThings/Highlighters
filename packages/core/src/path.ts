/**
 * `@highlighters/core/path` - the DOM-free, SSR-safe subpath.
 *
 * MUST NOT touch `window`/`document`/`Element`/`Range` at module load: only pure
 * geometry, config/palette helpers, and pure types, never `render/*` or `targeting/*`.
 * Seed-deterministic, so identical inputs produce byte-identical server and client output.
 */

export { resolveOptions, mergeOptions } from "./config/merge.js";
export { DEFAULT_OPTIONS } from "./config/defaults.js";
export { PALETTES, getPalette, resolveSwatch, defaultSwatch } from "./config/palettes.js";

export { buildMarkGeometry } from "./geometry/mark-space.js";
export { buildClipPath } from "./geometry/clip-path.js";
export { buildEdge } from "./geometry/edges.js";
export { buildNoiseTile, buildNoiseTileDataUrl } from "./geometry/noise-tile.js";
export { buildPoolGradient } from "./geometry/pool.js";
export { hashJitter, hashU32, mulberry } from "./geometry/rng.js";

// Pure types only - no DOM-touching types.
export type {
  ColorValue,
  MarkType,
  ShapeType,
  TipType,
  EdgeCap,
  BlendMode,
  SnapMode,
  RendererTier,
  RendererTierPreference,
  AnimationDirection,
  AnimationTrigger,
  EasingValue,
  GradientStop,
  GradientConfig,
  PaletteName,
  PaletteSwatch,
  Palette,
  TipOptions,
  InkOptions,
  EdgeOptions,
  PaperOptions,
  GlowOptions,
  AnimationOptions,
  HighlightOptions,
  ResolvedTip,
  ResolvedInk,
  ResolvedEdge,
  ResolvedPaper,
  ResolvedGlow,
  ResolvedAnimation,
  ResolvedOptions,
  Box,
  LineRect,
  Anchor,
  EdgeVertex,
  NoiseTile,
  MaskOffset,
  PoolGradient,
  MarkGeometry,
} from "./types.js";
