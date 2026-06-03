/**
 * Option merging and resolution. {@link mergeOptions} deep-merges two partials;
 * {@link resolveOptions} funnels to a fully-resolved {@link ResolvedOptions} via
 * the precedence defaults → preset → user. No DOM access (SSR-safe).
 */

import type {
  BlendMode,
  ColorValue,
  HighlightOptions,
  PaletteSwatch,
  ResolvedAnimation,
  ResolvedEdge,
  ResolvedGlow,
  ResolvedInk,
  ResolvedOptions,
  ResolvedPaper,
  ResolvedSpeedDynamics,
  ResolvedTip,
} from "../types.js";
import { clamp } from "../internal/math.js";
import { DEFAULT_OPTIONS } from "./defaults.js";
import { defaultSwatch, resolveSwatch } from "./palettes.js";
import { getPreset } from "./presets.js";

/**
 * A finite number, else `fallback`. `??` only catches `undefined`, so a `NaN` or
 * `±Infinity` (e.g. from `parseFloat("")`) would otherwise leak into geometry/CSS
 * and paint a broken mark. Every resolved numeric scalar funnels through this.
 */
function finiteOr(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/** A finite, strictly-positive number, else `fallback` — for durations. */
function positiveOr(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

/** The namespaced option groups that are merged field-wise rather than replaced. */
const GROUP_KEYS = ["tip", "ink", "speed", "edge", "paper", "glow", "animation"] as const;

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
 * Deep-merge two partial option objects: top-level scalars take `override`,
 * namespaced groups merge field-wise. The `shape`/`markType` synonyms collapse
 * onto a single canonical `markType`. Pure — neither input is mutated.
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
      (result as Record<GroupKey, unknown>)[key] = merged;
    }
  }

  // Override wins, then base; collapse both spellings onto markType.
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
  // Treat an empty/whitespace string as unset, so it falls back to the
  // palette/default instead of emitting an empty colour token into the gradient.
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
 * Resolve a (possibly partial) {@link HighlightOptions} into a fully-defaulted
 * {@link ResolvedOptions}, with precedence DEFAULT_OPTIONS → preset (default
 * `"mild"`) → explicit `input`. Pure — no DOM access.
 */
export function resolveOptions(input: HighlightOptions = {}): ResolvedOptions {
  const d = DEFAULT_OPTIONS;

  const preset = getPreset(input.preset ?? "mild");
  const layered: HighlightOptions = preset;
  const merged = mergeOptions(layered, input);

  const tip: ResolvedTip = {
    type: merged.tip?.type ?? d.tip.type,
    width: finiteOr(merged.tip?.width, d.tip.width),
    thickness: finiteOr(merged.tip?.thickness, d.tip.thickness),
    angle: finiteOr(merged.tip?.angle, d.tip.angle),
    overshoot: finiteOr(merged.tip?.overshoot, d.tip.overshoot),
    overshootJitter: finiteOr(merged.tip?.overshootJitter, d.tip.overshootJitter),
    angleJitter: finiteOr(merged.tip?.angleJitter, d.tip.angleJitter),
  };

  const ink: ResolvedInk = {
    flow: finiteOr(merged.ink?.flow, d.ink.flow),
    viscosity: finiteOr(merged.ink?.viscosity, d.ink.viscosity),
    feathering: finiteOr(merged.ink?.feathering, d.ink.feathering),
    streakiness: finiteOr(merged.ink?.streakiness, d.ink.streakiness),
    dryout: finiteOr(merged.ink?.dryout, d.ink.dryout),
    startEndBuildup: finiteOr(merged.ink?.startEndBuildup, d.ink.startEndBuildup),
    flowFade: finiteOr(merged.ink?.flowFade, d.ink.flowFade),
  };

  const sd = d.speed;
  // Order the thresholds so fastSpeed >= slowSpeed even if a caller inverts them —
  // otherwise the velocity normalizer's denominator collapses and the deposit
  // curve degenerates into a near-instant step function.
  const rawSlow = Math.max(0, finiteOr(merged.speed?.slowSpeed, sd.slowSpeed));
  const rawFast = Math.max(0, finiteOr(merged.speed?.fastSpeed, sd.fastSpeed));
  const speed: ResolvedSpeedDynamics = {
    enabled: merged.speed?.enabled ?? sd.enabled,
    sensitivity: clamp(finiteOr(merged.speed?.sensitivity, sd.sensitivity), 0, 1),
    slowSpeed: Math.min(rawSlow, rawFast),
    fastSpeed: Math.max(rawSlow, rawFast),
    minDeposit: clamp(finiteOr(merged.speed?.minDeposit, sd.minDeposit), 0, 1),
    smoothing: clamp(finiteOr(merged.speed?.smoothing, sd.smoothing), 0, 1),
    resolution: Math.max(4, Math.min(24, Math.round(finiteOr(merged.speed?.resolution, sd.resolution)))),
    dryoutBoost: clamp(finiteOr(merged.speed?.dryoutBoost, sd.dryoutBoost), 0, 1),
    streakBoost: clamp(finiteOr(merged.speed?.streakBoost, sd.streakBoost), 0, 1),
    featherReduce: clamp(finiteOr(merged.speed?.featherReduce, sd.featherReduce), 0, 1),
    poolBoost: clamp(finiteOr(merged.speed?.poolBoost, sd.poolBoost), 0, 1),
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

  // A user `palette` with no `color` must draw that palette's default swatch, even
  // when the active preset carries its own `color` object (which the spread would
  // otherwise leave in place). Detect intent from the RAW input, not the merged value.
  const color =
    input.color === undefined && input.palette !== undefined
      ? defaultSwatch(input.palette)
      : resolveColor(merged.color, merged.palette, d.color);

  const glow: ResolvedGlow = {
    enabled: merged.glow?.enabled ?? d.glow.enabled,
    intensity: finiteOr(merged.glow?.intensity, d.glow.intensity),
    spread: finiteOr(merged.glow?.spread, d.glow.spread),
    // Falls back to the ink color so an enabled glow blooms in-hue.
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
    // Clamp once here so every renderer tier receives a [0,1] alpha.
    opacity: Math.max(0, Math.min(1, finiteOr(merged.opacity, d.opacity))),
    blendMode,
    tip,
    ink,
    speed,
    edge,
    paper,
    glow,
    snap: merged.snap ?? d.snap,
    fadeOnClear: merged.fadeOnClear ?? d.fadeOnClear,
    renderer: merged.renderer ?? d.renderer,
    animation,
    semantic: merged.semantic ?? d.semantic,
    contrastBackground: merged.contrastBackground ?? d.contrastBackground,
    seed: merged.seed ?? d.seed,
  };
}
