/**
 * `@highlighters/core/path` — the DOM-free, SSR-safe subpath (blueprint R34).
 *
 * Importing this entry MUST NOT touch `window`/`document`/`Element`/`Range` at
 * module load. It re-exports **only** the pure geometry primitives, the config
 * resolution/preset/palette helpers, and the pure (Section 1) types — never any
 * `render/*` or `targeting/*` module. Use it from server code, build tooling, or
 * a flat/CSS-tier consumer that wants the geometry without the DOM runtime.
 *
 * All randomness here is deterministic from a seed (`hashJitter`), so identical
 * `(geometry, options, seed)` inputs produce byte-identical output on server and
 * client (R35).
 */

// --- Configuration (pure, no DOM) -------------------------------------------
export { resolveOptions, mergeOptions } from "./config/merge.js";
export { DEFAULT_OPTIONS } from "./config/defaults.js";
export { PRESETS, getPreset } from "./config/presets.js";
export { PALETTES, getPalette, resolveSwatch, defaultSwatch } from "./config/palettes.js";
export { applyColorantAxis, normalizeColorant } from "./config/colorant.js";

// --- Geometry (absolute-px mark-space, pure) --------------------------------
export { buildMarkGeometry } from "./geometry/mark-space.js";
export { buildClipPath } from "./geometry/clip-path.js";
export { buildEdge } from "./geometry/edges.js";
export { buildNoiseTile, buildNoiseTileDataUrl } from "./geometry/noise-tile.js";
export { buildPoolGradient } from "./geometry/pool.js";
export { hashJitter, hashU32, mulberry } from "./geometry/rng.js";

// --- Pure types only (Section 1 of types.ts; no DOM-touching types) ---------
export type {
  // Scalars and small unions
  ColorValue,
  MarkType,
  ShapeType,
  TipType,
  EdgeCap,
  BlendMode,
  SnapMode,
  QualityTier,
  RendererTier,
  RendererTierPreference,
  AnimationDirection,
  AnimationTrigger,
  EasingValue,
  ColorantValue,
  // Color, gradient, palettes, presets
  GradientStop,
  GradientConfig,
  PaletteName,
  PaletteSwatch,
  Palette,
  PresetName,
  // Namespaced option groups and resolved forms
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
  // Geometry (absolute-px mark-space)
  Box,
  LineRect,
  Anchor,
  EdgeVertex,
  NoiseTile,
  MaskOffset,
  PoolGradient,
  MarkGeometry,
} from "./types.js";
