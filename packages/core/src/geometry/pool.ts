import { clamp } from "../internal/math.js";
import type { ColorValue, GradientStop, PoolGradient } from "../types.js";

/**
 * The absolute-px end-pool gradient.
 *
 * A real marker pools a fixed blob of ink where the tip enters and leaves the
 * page, so the end darkening is a fixed px width, not a percentage of the stroke.
 * The stops sit at `2px, min(10px, 40%), max(100% - 10px, 60%), 100% - 2px`. The
 * `min`/`max` clamps stop the two pools overrunning each other on a short mark, so
 * long and short marks get the same pool width - only the flat middle differs.
 *
 * `startEndBuildup` scales pool darkness bidirectionally: positive pools the ends
 * darker than the core (cheap/wet look), zero is flat, negative is the anti-pool
 * "guardrail" where the ends are lighter than the core (premium look that engineers
 * against pooling).
 *
 * Returns a {@link PoolGradient} description in absolute px; the renderer turns it
 * into the actual CSS `linear-gradient(...)`.
 */

const DEFAULT_ANGLE = 85;

const START_INSET_PX = 2;
const CORE_PX = 10;
const START_CORE_PCT = 40;
const END_CORE_PCT = 60;
const END_INSET_PX = 2;

export interface PoolOptions {
  /** The band length in px (stroke direction). Drives the px↔% clamps. */
  lengthPx: number;
  /**
   * Bidirectional end deposit, `-1`–`1`. Positive pools the ends darker, `0` is
   * flat, negative engages the anti-pool guardrail (lighter ends).
   */
  startEndBuildup: number;
  color: ColorValue;
  /** The base ink alpha at the (flat) core, `0`–`1`. */
  opacity: number;
  /** Gradient angle in degrees; defaults to the canonical `85`. */
  angle?: number;
  /**
   * Directional dry-out, `0`–`1`. Scales every stop's alpha down from a saturated
   * start (×1) to a drier end (×`1 - flowFade`), so the band reads like a marker
   * running low on ink. `0` keeps the symmetric end-pool. Defaults to `0`.
   */
  flowFade?: number;
  /**
   * Reverse the dry-out direction (moist end, drying start) for a right-to-left
   * live selection where the nib touches down at the right edge. No effect when
   * `flowFade` is `0`. Defaults to `false`.
   */
  flowReversed?: boolean;
  /**
   * Live-speed path only. Number of interior core stops spread across the plateau
   * (≥2). Absent → the legacy 4-stop gradient (byte-identical output).
   */
  coreStopCount?: number;
  /**
   * Live-speed path only. Deposit multiplier in `[minDeposit, 1]` at core fraction
   * `f ∈ [0,1]` - `1` where the swipe was slow, lower where fast.
   */
  depositAt?: (fraction: number) => number;
  /**
   * Live-speed path only. Extra end-pool build-up from deceleration into the line
   * end, added to {@link startEndBuildup} for the two end stops.
   */
  decelBuildup?: number;
}

function roundAlpha(value: number): number {
  return Math.round(clamp(value, 0, 1) * 1000) / 1000;
}

/**
 * Build the absolute-px end-pool gradient. The four stops share the base `color`;
 * the two end stops get `opacity * (1 + 0.7*b)` and the two core stops the flat
 * `opacity`, so `b > 0` lifts the ends (darker pool), `b < 0` drops them
 * (guardrail), `b = 0` is flat. `flowFade` then tilts the whole ramp by
 * `1 - flowFade * offset` (heaviest ink where the nib touches down, drying toward
 * the end); `flowReversed` mirrors it for a right-to-left drag.
 */
export function buildPoolGradient(opts: PoolOptions): PoolGradient {
  const buildup = clamp(opts.startEndBuildup, -1, 1);
  const base = clamp(opts.opacity, 0, 1);
  const fade = clamp(opts.flowFade ?? 0, 0, 1);

  // 0.7 pool-contrast gain: at +1 the ends are 1.7× the core alpha (clamped to 1),
  // at -1 they drop to 0.3×. Deliberately strong so the knob reads in a screenshot.
  const endBase = base * (1 + 0.7 * buildup);
  const coreBase = base;
  const dryAt = (offset: number): number =>
    1 - fade * (opts.flowReversed ? 1 - offset : offset);

  const color: ColorValue = opts.color;

  const meta = {
    angle: opts.angle ?? DEFAULT_ANGLE,
    startInsetPx: START_INSET_PX,
    startCorePx: CORE_PX,
    startCorePct: START_CORE_PCT,
    endCorePx: CORE_PX,
    endCorePct: END_CORE_PCT,
    endInsetPx: END_INSET_PX,
  };

  // Legacy 4-stop gradient - taken whenever no live speed profile is present, so
  // static geometry and its CSS stay byte-identical.
  if (opts.coreStopCount == null && opts.depositAt == null && opts.decelBuildup == null) {
    return {
      ...meta,
      stops: [
        { offset: 0, color, opacity: roundAlpha(endBase * dryAt(0)) },
        { offset: 0.4, color, opacity: roundAlpha(coreBase * dryAt(0.4)) },
        { offset: 0.6, color, opacity: roundAlpha(coreBase * dryAt(0.6)) },
        { offset: 1, color, opacity: roundAlpha(endBase * dryAt(1)) },
      ],
    };
  }

  // Live speed path: N core stops carrying the per-x deposit profile.
  const n = Math.max(2, Math.round(opts.coreStopCount ?? 12));
  const deposit = opts.depositAt ?? ((): number => 1);
  const endBuildup = clamp(buildup + (opts.decelBuildup ?? 0), -1, 1);
  const endAlphaBase = base * (1 + 0.7 * endBuildup);

  // Core stops sit across the plateau BETWEEN the two px-clamped pool insets so
  // they never collide with the ends. Positions are evaluated to px here so the
  // renderer needs no nested calc/min/max.
  const len = Math.max(1, opts.lengthPx);
  const startCorePos = Math.min(CORE_PX, (START_CORE_PCT / 100) * len);
  const endCorePos = Math.max(len - CORE_PX, (END_CORE_PCT / 100) * len);
  const span = Math.max(0, endCorePos - startCorePos);

  const stops: GradientStop[] = [];
  const coreStopsPositionsPx: number[] = [];

  // The renderer normalizes per-stop alpha to the brightest stop, so a
  // uniformly-fast line would otherwise be normalized straight back to full.
  // Tracking peak alpha WITH and WITHOUT the speed factor lets `layerScale` carry
  // the absolute dimming into the renderer's layer opacity, leaving the stops to
  // express only the RELATIVE mid-line shape.
  const leadBaked = endAlphaBase * dryAt(0) * deposit(0);
  const trailBaked = endAlphaBase * dryAt(1) * deposit(1);
  let maxBaked = Math.max(leadBaked, trailBaked);
  let maxBare = Math.max(endBase * dryAt(0), endBase * dryAt(1));

  stops.push({ offset: 0, color, opacity: roundAlpha(leadBaked) });
  for (let i = 0; i < n; i++) {
    const f = n === 1 ? 0.5 : i / (n - 1);
    const baked = coreBase * dryAt(f) * deposit(f);
    const bare = coreBase * dryAt(f);
    if (baked > maxBaked) maxBaked = baked;
    if (bare > maxBare) maxBare = bare;
    stops.push({ offset: f, color, opacity: roundAlpha(baked) });
    coreStopsPositionsPx.push(startCorePos + f * span);
  }
  stops.push({ offset: 1, color, opacity: roundAlpha(trailBaked) });

  const layerScale = maxBare > 0 ? clamp(maxBaked / maxBare, 0, 1) : 1;

  return {
    ...meta,
    stops,
    coreStopCount: n,
    coreStopsPositionsPx,
    layerScale,
  };
}
