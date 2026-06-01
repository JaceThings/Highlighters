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
  /**
   * Reverse the dry-out direction so the moist start sits at the END of the band
   * (offset 1) and it dries toward the start. Set for a right-to-left (backward)
   * live selection, where the nib touches down at the right edge. No effect when
   * `flowFade` is `0`. Defaults to `false`.
   */
  flowReversed?: boolean;
  /**
   * LIVE-SPEED PATH ONLY. Number of interior core stops to spread across the
   * plateau (≥2). Absent → the legacy 4-stop gradient (byte-identical output).
   */
  coreStopCount?: number;
  /**
   * LIVE-SPEED PATH ONLY. Deposit multiplier in `[minDeposit, 1]` at core fraction
   * `f ∈ [0,1]` — `1` where the swipe was slow, lower where fast. Drives per-stop
   * alpha for continuous mid-line dry-out.
   */
  depositAt?: (fraction: number) => number;
  /**
   * LIVE-SPEED PATH ONLY. Extra end-pool build-up from deceleration into the line
   * end, added to {@link startEndBuildup} for the two end stops.
   */
  decelBuildup?: number;
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
 * end (R17). `flowFade = 0` leaves the symmetric end-pool untouched. `flowReversed`
 * mirrors that ramp — moist end, drying start — for a right-to-left drag.
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
  // Directional dry-out: full ink where the nib touches down, drying along the
  // swipe. Forward → moist at offset 0 (left); reversed → moist at offset 1
  // (right), so a backward drag pours its ink from the right edge.
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

  // Legacy 4-stop gradient — the exact original output, taken whenever no live
  // speed profile is present (every static mark and every no-drag live paint), so
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

  // --- Live speed path: N core stops carrying the per-x deposit profile -------
  const n = Math.max(2, Math.round(opts.coreStopCount ?? 12));
  const deposit = opts.depositAt ?? ((): number => 1);
  // Deceleration into the end adds to the symmetric end pooling.
  const endBuildup = clamp(buildup + (opts.decelBuildup ?? 0), -1, 1);
  const endAlphaBase = base * (1 + 0.7 * endBuildup);

  // Core stops sit across the plateau BETWEEN the two px-clamped pool insets, so
  // they never collide with the ends. Positions are evaluated to px here (the
  // renderer then needs no nested calc/min/max):
  //   start = min(corePx, corePct%·len),  end = max(len − corePx, corePct%·len).
  const len = Math.max(1, opts.lengthPx);
  const startCorePos = Math.min(CORE_PX, (START_CORE_PCT / 100) * len);
  const endCorePos = Math.max(len - CORE_PX, (END_CORE_PCT / 100) * len);
  const span = Math.max(0, endCorePos - startCorePos);

  const stops: GradientStop[] = [];
  const coreStopsPositionsPx: number[] = [];

  // Track the line's peak alpha WITH and WITHOUT the speed factor: the renderer
  // normalizes per-stop alpha to the brightest stop, so a uniformly-fast line
  // would otherwise be normalized straight back to full. `layerScale` carries the
  // absolute dimming (peak-with-speed / peak-without) into the renderer's layer
  // opacity, leaving the stops to express only the RELATIVE mid-line shape.
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
