import { clamp } from "../internal/math.js";
import type { ColorValue, GradientStop, PoolGradient } from "../types.js";

const DEFAULT_ANGLE = 85;

const START_INSET_PX = 2;
const CORE_PX = 10;
const START_CORE_PCT = 40;
const END_CORE_PCT = 60;
const END_INSET_PX = 2;

export interface PoolOptions {
  lengthPx: number;
  startEndBuildup: number;
  color: ColorValue;
  opacity: number;
  angle?: number;
  flowFade?: number;
  flowReversed?: boolean;
  coreStopCount?: number;
  depositAt?: (fraction: number) => number;
  decelBuildup?: number;
}

function roundAlpha(value: number): number {
  return Math.round(clamp(value, 0, 1) * 1000) / 1000;
}

export function buildPoolGradient(opts: PoolOptions): PoolGradient {
  const buildup = clamp(opts.startEndBuildup, -1, 1);
  const base = clamp(opts.opacity, 0, 1);
  const fade = clamp(opts.flowFade ?? 0, 0, 1);

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

  const n = Math.max(2, Math.round(opts.coreStopCount ?? 12));
  const deposit = opts.depositAt ?? ((): number => 1);
  const endBuildup = clamp(buildup + (opts.decelBuildup ?? 0), -1, 1);
  const endAlphaBase = base * (1 + 0.7 * endBuildup);

  const len = Math.max(1, opts.lengthPx);
  const startCorePos = Math.min(CORE_PX, (START_CORE_PCT / 100) * len);
  const endCorePos = Math.max(len - CORE_PX, (END_CORE_PCT / 100) * len);
  const span = Math.max(0, endCorePos - startCorePos);

  const stops: GradientStop[] = [];
  const coreStopsPositionsPx: number[] = [];

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
