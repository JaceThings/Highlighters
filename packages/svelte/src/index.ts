/** `@highlighters/svelte`: Svelte bindings for `@highlighters/core`. */
export { highlight, type HighlightAction } from "./highlight.js";

// Re-export core types for convenience.
export type {
  HighlightOptions,
  MarkHandle,
  GroupHandle,
  Target,
  TextTarget,
  PageTarget,
  PaletteName,
  PaletteSwatch,
  Palette,
  MarkType,
  ShapeType,
  TipType,
  EdgeCap,
  BlendMode,
  SnapMode,
  RendererTier,
  RendererTierPreference,
  GradientConfig,
  GradientStop,
  TipOptions,
  InkOptions,
  EdgeOptions,
  PaperOptions,
  GlowOptions,
  AnimationOptions,
} from "@highlighters/core";
