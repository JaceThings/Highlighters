/**
 * Option merging and resolution (A7).
 *
 * Two entry points:
 *  - {@link mergeOptions} — a pure, field-wise deep-merge of two partial option
 *    objects (namespaced groups merged independently, `override` winning per
 *    field, the `shape`/`markType` synonyms reconciled).
 *  - {@link resolveOptions} — the single funnel that produces a fully-resolved
 *    {@link ResolvedOptions} via the documented precedence
 *    **defaults → preset → quality → colorant → user**.
 *
 * No DOM access — this module is path-safe (SSR).
 */

import type {
  BlendMode,
  ColorValue,
  HighlightOptions,
  PaletteSwatch,
  QualityTier,
  ResolvedAnimation,
  ResolvedEdge,
  ResolvedGlow,
  ResolvedInk,
  ResolvedOptions,
  ResolvedPaper,
  ResolvedTip,
} from "../types.js";
import { applyColorantAxis, normalizeColorant } from "./colorant.js";
import { DEFAULT_OPTIONS } from "./defaults.js";
import { defaultSwatch, resolveSwatch } from "./palettes.js";
import { getPreset } from "./presets.js";

/**
 * The `quality` manufacturing-consistency bundles (R18). Quality is modeled as
 * variance injection: `premium` = low streak/feather/dryout and a suppressed
 * (anti-pool) end build-up; `cheap` = high streak/feather, frequent skipping,
 * pronounced pooling. `standard` is the neutral middle and contributes nothing.
 */
const QUALITY_BUNDLES: Record<QualityTier, Partial<HighlightOptions>> = {
  premium: {
    ink: {
      streakiness: 0.1,
      feathering: 0.12,
      dryout: 0.02,
      startEndBuildup: -0.3,
    },
    edge: { roughness: 0.12 },
  },
  standard: {},
  cheap: {
    ink: {
      streakiness: 0.7,
      feathering: 0.55,
      dryout: 0.55,
      startEndBuildup: 0.6,
    },
    edge: { roughness: 0.55 },
  },
};

/**
 * A finite number, else `fallback`. `??` only substitutes for `undefined`, so a
 * caller passing `NaN` or `±Infinity` (e.g. `parseFloat("")`) would otherwise leak
 * a non-finite value through resolve into geometry/CSS, painting a broken or
 * invisible mark. Every resolved numeric scalar funnels through this.
 */
function finiteOr(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/** A finite, strictly-positive number, else `fallback` — for durations. */
function positiveOr(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

/** The namespaced option groups that are merged field-wise rather than replaced. */
const GROUP_KEYS = ["tip", "ink", "edge", "paper", "glow", "animation"] as const;

type GroupKey = (typeof GROUP_KEYS)[number];

/** Shallow-merge a single namespaced group, with `override` winning per field. */
function mergeGroup(
  base: Record<string, unknown> | undefined,
  override: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (base === undefined) return override;
  if (override === undefined) return base;
  return { ...base, ...override };
}

/**
 * Deep-merge two partial option objects. Top-level scalars take the `override`
 * value when present; the namespaced groups (`tip`/`ink`/`edge`/`paper`/`glow`/
 * `animation`) merge field-wise. The `shape`/`markType` synonyms are reconciled
 * so whichever the override supplies last wins and the result carries a single
 * canonical `markType`. Pure — neither input is mutated.
 */
export function mergeOptions(
  base: HighlightOptions,
  override: HighlightOptions,
): HighlightOptions {
  const result: HighlightOptions = { ...base, ...override };

  for (const key of GROUP_KEYS) {
    const merged = mergeGroup(
      base[key] as Record<string, unknown> | undefined,
      override[key] as Record<string, unknown> | undefined,
    );
    if (merged === undefined) {
      delete result[key];
    } else {
      // The merged group is a fresh object — safe to assign back.
      (result as Record<GroupKey, unknown>)[key] = merged;
    }
  }

  // Reconcile shape/markType synonyms: prefer whichever the override set, then
  // whichever the base set, and collapse both spellings onto markType.
  const markType =
    override.markType ?? override.shape ?? base.markType ?? base.shape;
  if (markType !== undefined) {
    result.markType = markType;
    delete result.shape;
  }

  return result;
}

/** Resolve the `color`/`palette` inputs to a concrete {@link ColorValue}. */
function resolveColor(
  color: ColorValue | PaletteSwatch | undefined,
  palette: HighlightOptions["palette"],
  fallback: ColorValue,
): ColorValue {
  // An empty/whitespace string (e.g. a controlled input before a swatch is
  // chosen) is treated as unset, so it falls back to the palette/default rather
  // than emitting an empty colour token into the gradient.
  if (typeof color === "string" && color.trim() !== "") {
    return color;
  }
  if (color && typeof color === "object") {
    return resolveSwatch(color);
  }
  if (palette) {
    return defaultSwatch(palette);
  }
  return fallback;
}

/**
 * Resolve a (possibly partial) {@link HighlightOptions} into the fully-defaulted
 * {@link ResolvedOptions} handed to geometry and renderers.
 *
 * Precedence, lowest to highest:
 *   1. `DEFAULT_OPTIONS` (the baseline floor)
 *   2. the named preset (`input.preset`, default `"mild"`)
 *   3. the `quality` bundle
 *   4. the `colorant` dye↔pigment axis (defaults for unset ink params)
 *   5. the explicit `input`
 *
 * `color`/`palette`/`gradient`/`colorant`/`seed` are resolved to concrete values.
 * Pure — no DOM access.
 */
export function resolveOptions(input: HighlightOptions = {}): ResolvedOptions {
  const d = DEFAULT_OPTIONS;

  // 2. Preset layer (mild by default).
  const preset = getPreset(input.preset ?? "mild");
  let layered: HighlightOptions = preset;

  // 3. Quality bundle. The effective quality is the user's, else the preset's,
  // else the baseline standard.
  const quality: QualityTier = input.quality ?? preset.quality ?? d.quality;
  layered = mergeOptions(layered, QUALITY_BUNDLES[quality]);

  // 4. Colorant axis fills unset ink params. The effective position is the
  // user's, else the preset's, else the baseline midpoint.
  const colorantRaw = input.colorant ?? preset.colorant ?? d.colorant;
  const colorant = normalizeColorant(colorantRaw);
  layered = applyColorantAxis(layered, colorant);

  // 5. Explicit user options win last.
  const merged = mergeOptions(layered, input);

  // --- Flatten to ResolvedOptions, filling any still-unset field from d. ---

  const tip: ResolvedTip = {
    type: merged.tip?.type ?? d.tip.type,
    width: finiteOr(merged.tip?.width, d.tip.width),
    thickness: finiteOr(merged.tip?.thickness, d.tip.thickness),
    angle: finiteOr(merged.tip?.angle, d.tip.angle),
    overshoot: finiteOr(merged.tip?.overshoot, d.tip.overshoot),
    overshootJitter: finiteOr(merged.tip?.overshootJitter, d.tip.overshootJitter),
  };

  const ink: ResolvedInk = {
    flow: finiteOr(merged.ink?.flow, d.ink.flow),
    viscosity: finiteOr(merged.ink?.viscosity, d.ink.viscosity),
    saturation: finiteOr(merged.ink?.saturation, d.ink.saturation),
    feathering: finiteOr(merged.ink?.feathering, d.ink.feathering),
    streakiness: finiteOr(merged.ink?.streakiness, d.ink.streakiness),
    dryout: finiteOr(merged.ink?.dryout, d.ink.dryout),
    startEndBuildup: finiteOr(merged.ink?.startEndBuildup, d.ink.startEndBuildup),
  };

  const edge: ResolvedEdge = {
    waviness: finiteOr(merged.edge?.waviness, d.edge.waviness),
    frequency: finiteOr(merged.edge?.frequency, d.edge.frequency),
    roughness: finiteOr(merged.edge?.roughness, d.edge.roughness),
    cap: merged.edge?.cap ?? d.edge.cap,
    radius: finiteOr(merged.edge?.radius, d.edge.radius),
  };

  const paper: ResolvedPaper = {
    absorbency: finiteOr(merged.paper?.absorbency, d.paper.absorbency),
  };

  // A user-supplied `palette` with no `color` draws that palette's default
  // swatch — even when the active preset carries its own `color` object (which
  // the shallow option spread would otherwise leave in place, silently ignoring
  // the user's palette). An explicit `color` always wins; detect intent from the
  // RAW input, not the preset-merged value.
  const color =
    input.color === undefined && input.palette !== undefined
      ? defaultSwatch(input.palette)
      : resolveColor(merged.color, merged.palette, d.color);

  const glow: ResolvedGlow = {
    enabled: merged.glow?.enabled ?? d.glow.enabled,
    intensity: finiteOr(merged.glow?.intensity, d.glow.intensity),
    spread: finiteOr(merged.glow?.spread, d.glow.spread),
    // Falls back to the ink color so an enabled glow blooms in-hue by default.
    color: merged.glow?.color ?? (d.glow.color || color),
  };

  const animation: ResolvedAnimation = {
    draw: merged.animation?.draw ?? d.animation.draw,
    duration: positiveOr(merged.animation?.duration, d.animation.duration),
    easing: merged.animation?.easing ?? d.animation.easing,
    direction: merged.animation?.direction ?? d.animation.direction,
    stagger: finiteOr(merged.animation?.stagger, d.animation.stagger),
    trigger: merged.animation?.trigger ?? d.animation.trigger,
    threshold: finiteOr(merged.animation?.threshold, d.animation.threshold),
    rootMargin: merged.animation?.rootMargin ?? d.animation.rootMargin,
    repeat: merged.animation?.repeat ?? d.animation.repeat,
  };

  const blendMode: BlendMode = merged.blendMode ?? d.blendMode;

  return {
    markType: merged.markType ?? merged.shape ?? d.markType,
    color,
    gradient: merged.gradient ?? d.gradient,
    opacity: finiteOr(merged.opacity, d.opacity),
    blendMode,
    tip,
    ink,
    edge,
    paper,
    glow,
    colorant,
    quality,
    snap: merged.snap ?? d.snap,
    renderer: merged.renderer ?? d.renderer,
    animation,
    semantic: merged.semantic ?? d.semantic,
    contrastBackground: merged.contrastBackground ?? d.contrastBackground,
    seed: merged.seed ?? d.seed,
  };
}
