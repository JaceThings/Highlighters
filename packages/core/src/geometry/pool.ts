import { clamp } from "../internal/math.js";
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
  /**
   * Directional dry-out, `0`–`1`. Scales every stop's alpha down from a saturated
   * start (offset 0, ×1) to a drier end (offset 1, ×`1 - flowFade`), so the band
   * reads like a marker running low on ink as it slides. `0` keeps the symmetric
   * end-pool. Defaults to `0`.
   */
  flowFade?: number;
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
 *  - the two **end** stops (offsets `0` and `1`) get `opacity * (1 + 0.7*b)`;
 *  - the two **core** stops get the flat `opacity`.
 *
 * So `b > 0` lifts the ends above the core (darker pool), `b < 0` drops them
 * below it (guardrail / suppressed pooling), and `b = 0` makes all four equal —
 * a flat band. The gain is deliberately strong so dragging the slider produces a
 * clearly visible wet-pool ↔ anti-pool delta at the ends. Alphas clamp to `[0,1]`.
 *
 * `flowFade` then tilts the whole ramp directionally: each stop's alpha is scaled
 * by `1 - flowFade * offset`, full at the start and `1 - flowFade` at the end, so
 * the stroke lays its heaviest ink where the nib touches down and dries toward the
 * end (R17). `flowFade = 0` leaves the symmetric end-pool untouched.
 */
export function buildPoolGradient(opts: PoolOptions): PoolGradient {
  const buildup = clamp(opts.startEndBuildup, -1, 1);
  const base = clamp(opts.opacity, 0, 1);
  const fade = clamp(opts.flowFade ?? 0, 0, 1);

  // 0.7 is the pool-contrast gain: at full +1 the ends are 1.7× the core alpha
  // (clamped to 1) — an obvious wet pool; at full -1 they drop to 0.3× (a clearly
  // lighter, anti-pooled end). The strong gain makes the knob read in a screenshot.
  const endBase = base * (1 + 0.7 * buildup);
  const coreBase = base;
  // Directional dry-out: ×1 at the start (offset 0) → ×(1-fade) at the end.
  const dryAt = (offset: number): number => 1 - fade * offset;

  const color: ColorValue = opts.color;
  const stops: GradientStop[] = [
    { offset: 0, color, opacity: roundAlpha(endBase * dryAt(0)) },
    { offset: 0.4, color, opacity: roundAlpha(coreBase * dryAt(0.4)) },
    { offset: 0.6, color, opacity: roundAlpha(coreBase * dryAt(0.6)) },
    { offset: 1, color, opacity: roundAlpha(endBase * dryAt(1)) },
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
