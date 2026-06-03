/**
 * `@highlighters/svelte` — Svelte bindings for `@highlighters/core`.
 *
 * A thin `highlight` action (blueprint A1) that delegates fully to the core
 * `highlight()` pipeline. No rendering logic lives here.
 */
export { highlight, type HighlightAction } from "./highlight.js";

// Re-export the core option/handle/target types so consumers get them from the
// wrapper without a separate `@highlighters/core` import.
export type {
  HighlightOptions,
  MarkHandle,
  GroupHandle,
  Target,
  TextTarget,
  PageTarget,
  PresetName,
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
