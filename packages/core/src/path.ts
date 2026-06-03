/**
 * `@highlighters/core/path` — the DOM-free, SSR-safe subpath.
 *
 * Importing this entry MUST NOT touch `window`/`document`/`Element`/`Range` at
 * module load. It re-exports only pure geometry primitives, config/preset/palette
 * helpers, and the pure (Section 1) types — never any `render/*` or `targeting/*`
 * module. Randomness is seed-deterministic, so identical `(geometry, options,
 * seed)` inputs produce byte-identical output on server and client.
 */

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

// Pure (Section 1) types only — no DOM-touching types.
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
  PresetName,
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
