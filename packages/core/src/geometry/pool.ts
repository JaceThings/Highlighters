import type { ColorValue, GradientStop, PoolGradient } from "../types.js";

/**
 * The absolute-px end-pool gradient (anchored-grid doc §3, blueprint R22c / A14
 * §3, R17).
 *
 * A real marker pools a fixed blob of ink where the tip enters and leaves the
 * page, so the end darkening is a fixed **px** width, not a percentage of the
 * stroke. The stops sit at:
 *
 * ```
 * 2px, min(10px, 40%), max(100% - 10px, 60%), 100% - 2px
 * ```
 *
 * The `min`/`max` clamps mean the two pools cannot overrun each other on a short
 * mark (each is capped at ~half the overlay). Because the inset is absolute px,
 * a long mark and a short mark get the *same* pool width — only the flat middle
 * differs (R22c / V9e).
 *
 * `startEndBuildup` scales the pool darkness **bidirectionally** (R17):
 *
 *  - **positive** → the ends pool darker than the core (the cheap/wet look);
 *  - **zero**     → flat, even coverage end to end;
 *  - **negative** → the anti-pool / "guardrail" behavior: the ends are *lighter*
 *    than the core (the premium Pilot-Kire-Na look that engineers against
 *    pooling). End darkening is suppressed rather than added.
 *
 * Pure: returns a {@link PoolGradient} description in absolute px; the renderer
 * turns it into the actual CSS `linear-gradient(...)`.
 */

/** The canonical swipe angle for the pooling gradient. */
const DEFAULT_ANGLE = 85;

/** Pool geometry, all in absolute px / percent. */
const START_INSET_PX = 2;
const CORE_PX = 10;
const START_CORE_PCT = 40;
const END_CORE_PCT = 60;
const END_INSET_PX = 2;

/** Options for {@link buildPoolGradient}. */
export interface PoolOptions {
  /** The band length in px (the stroke direction). Drives the px↔% clamps. */
  lengthPx: number;
  /**
   * Bidirectional end deposit, `-1`–`1`. Positive pools the ends darker, `0` is
   * flat, negative engages the anti-pool guardrail (lighter ends).
   */
  startEndBuildup: number;
  /** The base ink color the pool ramps around. */
  color: ColorValue;
  /** The base ink alpha at the (flat) core, `0`–`1`. */
  opacity: number;
  /** Gradient angle in degrees; defaults to the canonical `85`. */
  angle?: number;
}

/** Clamp a value into `[lo, hi]`. */
function clamp(value: number, lo: number, hi: number): number {
  return value < lo ? lo : value > hi ? hi : value;
}

/** Round an alpha to 3 decimals for stable, compact stop strings. */
function roundAlpha(value: number): number {
  return Math.round(clamp(value, 0, 1) * 1000) / 1000;
}

/**
 * Build the absolute-px end-pool gradient.
 *
 * The four stops share the base `color`; their alphas are the base `opacity`
 * scaled by a per-end pool factor. With `startEndBuildup = b`:
 *
 *  - the two **end** stops (offsets `0` and `1`) get `opacity * (1 + 0.45*b)`;
 *  - the two **core** stops get the flat `opacity`.
 *
 * So `b > 0` lifts the ends above the core (darker pool), `b < 0` drops them
 * below it (guardrail / suppressed pooling), and `b = 0` makes all four equal —
 * a flat band. Alphas are clamped to `[0, 1]`.
 */
export function buildPoolGradient(opts: PoolOptions): PoolGradient {
  const buildup = clamp(opts.startEndBuildup, -1, 1);
  const base = clamp(opts.opacity, 0, 1);

  // 0.45 is the pool-contrast gain: at full +1 the ends are ~1.45× the core
  // alpha (clamped), at full -1 they drop to ~0.55× (the guardrail floor).
  const endAlpha = roundAlpha(base * (1 + 0.45 * buildup));
  const coreAlpha = roundAlpha(base);

  const color: ColorValue = opts.color;
  const stops: GradientStop[] = [
    { offset: 0, color, opacity: endAlpha },
    { offset: 0.4, color, opacity: coreAlpha },
    { offset: 0.6, color, opacity: coreAlpha },
    { offset: 1, color, opacity: endAlpha },
  ];

  return {
    angle: opts.angle ?? DEFAULT_ANGLE,
    startInsetPx: START_INSET_PX,
    startCorePx: CORE_PX,
    startCorePct: START_CORE_PCT,
    endCorePx: CORE_PX,
    endCorePct: END_CORE_PCT,
    endInsetPx: END_INSET_PX,
    stops,
  };
}
