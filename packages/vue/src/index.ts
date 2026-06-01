/**
 * `@highlighters/vue` — Vue bindings for `@highlighters/core`.
 *
 * Thin, declarative bindings (blueprint A1): a `useHighlight` composable and a
 * `<Highlight>` component, both delegating fully to the core `highlight()`
 * pipeline. No rendering logic lives here.
 */
export { useHighlight, type HighlightTarget } from "./use-highlight.js";
export { Highlight } from "./highlight.js";

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
  QualityTier,
  ColorantValue,
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
