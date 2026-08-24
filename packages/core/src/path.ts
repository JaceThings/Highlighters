// This entry must stay DOM-free: no render/* or targeting/* imports.
export { resolveOptions, mergeOptions } from "./config/merge.js";
export { DEFAULT_OPTIONS } from "./config/defaults.js";
export { PALETTES, getPalette, resolveSwatch, defaultSwatch } from "./config/palettes.js";

export { buildMarkGeometry } from "./geometry/mark-space.js";
export { buildClipPath } from "./geometry/clip-path.js";
export { buildEdge } from "./geometry/edges.js";
export { buildNoiseTile, buildNoiseTileDataUrl } from "./geometry/noise-tile.js";
export { buildPoolGradient } from "./geometry/pool.js";
export { hashJitter, hashU32, mulberry } from "./geometry/rng.js";

export type {
  ColorValue,
  MarkType,
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
