import type {
  ColorValue,
  HighlightOptions,
  PaletteSwatch,
  ResolvedOptions,
} from "../types.js";
import { clamp } from "../internal/math.js";
import { DEFAULT_OPTIONS } from "./defaults.js";
import { defaultSwatch, resolveSwatch } from "./palettes.js";

function finiteOr(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) ? value : fallback;
}

function positiveOr(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) && value > 0 ? value : fallback;
}

const GROUP_KEYS = ["tip", "ink", "speed", "edge", "paper", "glow", "animation"] as const;

export function mergeOptions(base: HighlightOptions, override: HighlightOptions): HighlightOptions {
  const result: HighlightOptions = { ...base, ...override };
  for (const key of GROUP_KEYS) {
    const a = base[key];
    const b = override[key];
    const merged = a && b ? { ...a, ...b } : (a ?? b);
    if (merged === undefined) delete result[key];
    else result[key] = merged;
  }
  const markType = override.markType ?? base.markType;
  if (markType !== undefined) result.markType = markType;
  return result;
}

function resolveColor(
  color: ColorValue | PaletteSwatch | undefined,
  palette: HighlightOptions["palette"],
  fallback: ColorValue,
): ColorValue {
  if (color && typeof color === "object") return resolveSwatch(color);
  if (color && color.trim() !== "") return color;
  return palette ? defaultSwatch(palette) : fallback;
}

export function resolveOptions(input: HighlightOptions = {}): ResolvedOptions {
  const d = DEFAULT_OPTIONS;
  const tip = input.tip ?? {};
  const ink = input.ink ?? {};
  const sp = input.speed ?? {};
  const edge = input.edge ?? {};
  const glow = input.glow ?? {};
  const anim = input.animation ?? {};

  const color = resolveColor(input.color, input.palette, d.color);
  const rawSlow = Math.max(0, finiteOr(sp.slowSpeed, d.speed.slowSpeed));
  const rawFast = Math.max(0, finiteOr(sp.fastSpeed, d.speed.fastSpeed));

  return {
    markType: input.markType ?? d.markType,
    color,
    gradient: input.gradient ?? d.gradient,
    opacity: clamp(finiteOr(input.opacity, d.opacity), 0, 1),
    blendMode: input.blendMode ?? d.blendMode,
    vivid: input.vivid ?? d.vivid,
    tip: {
      type: tip.type ?? d.tip.type,
      width: finiteOr(tip.width, d.tip.width),
      thickness: finiteOr(tip.thickness, d.tip.thickness),
      angle: finiteOr(tip.angle, d.tip.angle),
      overshoot: finiteOr(tip.overshoot, d.tip.overshoot),
      overshootJitter: finiteOr(tip.overshootJitter, d.tip.overshootJitter),
      angleJitter: finiteOr(tip.angleJitter, d.tip.angleJitter),
    },
    ink: {
      flow: finiteOr(ink.flow, d.ink.flow),
      viscosity: finiteOr(ink.viscosity, d.ink.viscosity),
      feathering: finiteOr(ink.feathering, d.ink.feathering),
      streakiness: finiteOr(ink.streakiness, d.ink.streakiness),
      dryout: finiteOr(ink.dryout, d.ink.dryout),
      startEndBuildup: finiteOr(ink.startEndBuildup, d.ink.startEndBuildup),
      flowFade: finiteOr(ink.flowFade, d.ink.flowFade),
    },
    speed: {
      enabled: sp.enabled ?? d.speed.enabled,
      sensitivity: clamp(finiteOr(sp.sensitivity, d.speed.sensitivity), 0, 1),
      slowSpeed: Math.min(rawSlow, rawFast),
      fastSpeed: Math.max(rawSlow, rawFast),
      minDeposit: clamp(finiteOr(sp.minDeposit, d.speed.minDeposit), 0, 1),
      smoothing: clamp(finiteOr(sp.smoothing, d.speed.smoothing), 0, 1),
      resolution: clamp(Math.round(finiteOr(sp.resolution, d.speed.resolution)), 4, 24),
      dryoutBoost: clamp(finiteOr(sp.dryoutBoost, d.speed.dryoutBoost), 0, 1),
      streakBoost: clamp(finiteOr(sp.streakBoost, d.speed.streakBoost), 0, 1),
      featherReduce: clamp(finiteOr(sp.featherReduce, d.speed.featherReduce), 0, 1),
      poolBoost: clamp(finiteOr(sp.poolBoost, d.speed.poolBoost), 0, 1),
    },
    edge: {
      waviness: finiteOr(edge.waviness, d.edge.waviness),
      frequency: finiteOr(edge.frequency, d.edge.frequency),
      roughness: finiteOr(edge.roughness, d.edge.roughness),
      cap: edge.cap ?? d.edge.cap,
      radius: finiteOr(edge.radius, d.edge.radius),
    },
    paper: { absorbency: finiteOr(input.paper?.absorbency, d.paper.absorbency) },
    glow: {
      enabled: glow.enabled ?? d.glow.enabled,
      intensity: finiteOr(glow.intensity, d.glow.intensity),
      spread: finiteOr(glow.spread, d.glow.spread),
      color: glow.color ?? (d.glow.color || color),
    },
    snap: input.snap ?? d.snap,
    fadeOnClear: input.fadeOnClear ?? d.fadeOnClear,
    renderer: input.renderer ?? d.renderer,
    animation: {
      draw: anim.draw ?? d.animation.draw,
      duration: positiveOr(anim.duration, d.animation.duration),
      easing: anim.easing ?? d.animation.easing,
      direction: anim.direction ?? d.animation.direction,
      stagger: finiteOr(anim.stagger, d.animation.stagger),
      trigger: anim.trigger ?? d.animation.trigger,
      threshold: finiteOr(anim.threshold, d.animation.threshold),
      rootMargin: anim.rootMargin ?? d.animation.rootMargin,
      repeat: anim.repeat ?? d.animation.repeat,
    },
    semantic: input.semantic ?? d.semantic,
    contrastBackground: input.contrastBackground ?? d.contrastBackground,
    seed: input.seed ?? d.seed,
  };
}
