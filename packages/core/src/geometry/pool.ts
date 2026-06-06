import { clamp } from "../internal/math.js";
import type { ColorValue, GradientStop, PoolGradient } from "../types.js";

/**
 * The absolute-px end-pool gradient: end darkening is a fixed px width, not a stroke percentage.
 * The `min`/`max` clamps stop the two pools overrunning each other on a short mark, so long and
 * short marks share the same pool width. `startEndBuildup` scales pool darkness bidirectionally
 * (positive darker ends, negative lighter ends). The renderer turns the {@link PoolGradient} into CSS.
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
  /** Bidirectional end deposit, `-1`-`1`: positive darker ends, negative lighter ends. */
  startEndBuildup: number;
  color: ColorValue;
  /** Base ink alpha at the flat core, `0`-`1`. */
  opacity: number;
  /** Gradient angle in degrees; defaults to `85`. */
  angle?: number;
  /** Directional dry-out, `0`-`1`: scales every stop's alpha down toward the end. Defaults to `0`. */
  flowFade?: number;
  /** Reverse the dry-out direction for a right-to-left live selection. No effect when `flowFade` is `0`. */
  flowReversed?: boolean;
  /** Live-speed only. Number of interior core stops (>=2). Absent yields the 4-stop gradient. */
  coreStopCount?: number;
  /** Live-speed only. Deposit multiplier in `[minDeposit, 1]` at core fraction `f`: `1` where slow, lower where fast. */
  depositAt?: (fraction: number) => number;
  /** Live-speed only. Extra end-pool build-up from deceleration, added to {@link startEndBuildup} for the end stops. */
  decelBuildup?: number;
}

function roundAlpha(value: number): number {
  return Math.round(clamp(value, 0, 1) * 1000) / 1000;
}

/** Build the absolute-px end-pool gradient. `startEndBuildup` lifts/drops the end stops, then `flowFade` tilts the whole ramp toward the drying end. */
export function buildPoolGradient(opts: PoolOptions): PoolGradient {
  const buildup = clamp(opts.startEndBuildup, -1, 1);
  const base = clamp(opts.opacity, 0, 1);
  const fade = clamp(opts.flowFade ?? 0, 0, 1);

  // 0.7 pool-contrast gain: +1 makes the ends 1.7x the core alpha, -1 drops them to 0.3x.
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

  // 4-stop gradient whenever no live speed profile is present, so static geometry stays byte-identical.
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

  // Core stops sit between the two px-clamped pool insets, positions resolved to px so the renderer needs no nested calc/min/max.
  const len = Math.max(1, opts.lengthPx);
  const startCorePos = Math.min(CORE_PX, (START_CORE_PCT / 100) * len);
  const endCorePos = Math.max(len - CORE_PX, (END_CORE_PCT / 100) * len);
  const span = Math.max(0, endCorePos - startCorePos);

  const stops: GradientStop[] = [];
  const coreStopsPositionsPx: number[] = [];

  // The renderer normalizes per-stop alpha to the brightest stop, so a uniformly-fast line would
  // normalize back to full. Tracking peak alpha with and without the speed factor lets `layerScale`
  // carry the absolute dimming into layer opacity, leaving the stops to express only relative shape.
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
