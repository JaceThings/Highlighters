import type {
  Box,
  LineRect,
  LineSpeedProfile,
  MarkGeometry,
  MaskOffset,
  NoiseTile,
  ResolvedOptions,
} from "../types.js";
import { clamp } from "../internal/math.js";
import { buildClipPath, chiselSlant, minVisibleFront } from "./clip-path.js";
import { buildEdge } from "./edges.js";
import { buildNoiseTile } from "./noise-tile.js";
import { buildPoolGradient, type PoolOptions } from "./pool.js";
import { hashJitter } from "./rng.js";

const VERT_PAD = 2;

const SEED_LEFT_OVER = 0;
const SEED_RIGHT_OVER = 11;
const SEED_TOP_EDGE = 200;
const SEED_BOTTOM_EDGE = 300;
const SEED_ANGLE = 400;

const MASK_X_MULT = 37;
const MASK_Y_MULT = 13;
const NOISE_TILE_W = 1024;
const NOISE_TILE_H = 64;
const MASK_OFFSET_X = 96;
const MASK_OFFSET_Y = 16;

function mod(n: number, m: number): number {
  return ((n % m) + m) % m;
}

interface BandPlacement {
  offsetY: number;
  height: number;
}

function resolveBand(
  markType: ResolvedOptions["markType"],
  lineHeight: number,
): BandPlacement {
  const thin = Math.max(2, lineHeight * 0.12);
  switch (markType) {
    case "underline":
      return { offsetY: lineHeight - thin, height: thin };
    case "overline":
      return { offsetY: 0, height: thin };
    case "strike-through":
      return { offsetY: (lineHeight - thin) / 2, height: thin };
    default:
      return { offsetY: 0, height: lineHeight };
  }
}

export function buildMarkGeometry(
  lineRect: LineRect,
  options: ResolvedOptions,
  seed: number,
  flowReversed = false,
  speedProfile?: LineSpeedProfile,
): MarkGeometry {
  const { edge, ink, tip, paper, speed } = options;

  const endOver = (s: number): number =>
    tip.overshoot + hashJitter(s) * tip.overshootJitter;
  const leftExt = endOver(seed + SEED_LEFT_OVER);
  const rightExt = endOver(seed + SEED_RIGHT_OVER);

  const slantTip =
    tip.angleJitter > 0
      ? { ...tip, angle: tip.angle + hashJitter(seed + SEED_ANGLE) * tip.angleJitter }
      : tip;

  const band = resolveBand(options.markType, lineRect.height);
  const boxX = lineRect.left - leftExt;
  const boxY = lineRect.top - VERT_PAD + band.offsetY;
  const boxWidth = Math.max(1, lineRect.width + leftExt + rightExt);
  const boxHeight = band.height + VERT_PAD * 2;
  const box: Box = { x: boxX, y: boxY, width: boxWidth, height: boxHeight };

  const amplitude = edge.waviness * (1 + paper.absorbency * 0.5);
  const segmentLength = edge.frequency;

  const absStartX = box.x;
  const absEndX = box.x + box.width;

  const topAbs = buildEdge({
    startX: absStartX,
    endX: absEndX,
    baseY: 0,
    segmentLength,
    amplitude,
    roughness: edge.roughness,
    seed: seed + SEED_TOP_EDGE,
  });
  const bottomAbs = buildEdge({
    startX: absStartX,
    endX: absEndX,
    baseY: box.height,
    segmentLength,
    amplitude,
    roughness: edge.roughness,
    seed: seed + SEED_BOTTOM_EDGE,
  });

  const originX = box.x;
  for (const v of topAbs) v.x -= originX;
  for (const v of bottomAbs) v.x -= originX;
  const topEdge = topAbs;
  const bottomEdge = bottomAbs;

  const clipAtFront = (front: number): string =>
    buildClipPath({
      box,
      tip: slantTip,
      topEdge,
      bottomEdge,
      cap: edge.cap,
      radius: edge.radius,
      front,
    });
  const clipPath = clipAtFront(box.width);

  const sp = speedProfile;
  const m = sp ? sp.meanNorm : 0;
  const sens = speed.sensitivity;
  const baseDryout = ink.dryout + ink.viscosity * 0.2;
  const baseStreak = ink.streakiness;
  const baseFeather = ink.feathering + paper.absorbency * 0.25;
  const noiseTile: NoiseTile = buildNoiseTile({
    width: NOISE_TILE_W,
    height: NOISE_TILE_H,
    seed,
    streakiness: sp
      ? clamp(baseStreak + speed.streakBoost * sens * m * Math.max(0, 1 - baseStreak), 0, 1)
      : baseStreak,
    feathering: sp ? Math.max(0, baseFeather * (1 - speed.featherReduce * sens * m)) : baseFeather,
    dryout: sp
      ? clamp(baseDryout + speed.dryoutBoost * sens * m * Math.max(0, 1 - baseDryout), 0, 1)
      : baseDryout,
  });
  const maskOffset: MaskOffset = {
    x: -mod(seed * MASK_X_MULT, MASK_OFFSET_X),
    y: -mod(seed * MASK_Y_MULT, MASK_OFFSET_Y),
  };

  const poolInput: PoolOptions = {
    lengthPx: box.width,
    startEndBuildup: ink.startEndBuildup,
    color: options.color,
    opacity: options.opacity,
    angle: options.gradient?.angle ?? undefined,
    flowFade: ink.flowFade,
    flowReversed,
  };
  if (sp) {
    poolInput.coreStopCount = speed.resolution;
    poolInput.depositAt = sp.depositAt;
    poolInput.decelBuildup = speed.poolBoost * sens * sp.decel;
  }
  const pool = buildPoolGradient(poolInput);

  return {
    box,
    seed,
    clipPath,
    clipAtFront,
    slant: chiselSlant(slantTip, box.width, box.height),
    minFront: Math.min(minVisibleFront(slantTip, edge.cap, box.width, box.height, edge.radius), box.width),
    topEdge,
    bottomEdge,
    noiseTile,
    maskOffset,
    pool,
  };
}
