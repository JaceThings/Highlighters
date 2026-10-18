import type {
  Box,
  LineRect,
  LineSpeedProfile,
  MarkGeometry,
  ResolvedOptions,
} from "../types.js";
import { clamp } from "../internal/math.js";
import { buildClipPath, chiselSlant, minVisibleFront } from "./clip-path.js";
import { buildEdge } from "./edges.js";
import { buildPoolGradient, type PoolOptions } from "./pool.js";
import { hashJitter } from "./rng.js";

const VERT_PAD = 2;

const SEED_LEFT_OVER = 0;
const SEED_RIGHT_OVER = 11;
const SEED_TOP_EDGE = 200;
const SEED_BOTTOM_EDGE = 300;
const SEED_ANGLE = 400;

function resolveBand(
  markType: ResolvedOptions["markType"],
  lineHeight: number,
): { offsetY: number; height: number } {
  const thin = Math.max(2, lineHeight * 0.12);
  if (markType === "underline") return { offsetY: lineHeight - thin, height: thin };
  if (markType === "overline") return { offsetY: 0, height: thin };
  if (markType === "strike-through") return { offsetY: (lineHeight - thin) / 2, height: thin };
  return { offsetY: 0, height: lineHeight };
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
  const box: Box = {
    x: lineRect.left - leftExt,
    y: lineRect.top - VERT_PAD + band.offsetY,
    width: Math.max(1, lineRect.width + leftExt + rightExt),
    height: band.height + VERT_PAD * 2,
  };

  // Edges are sampled in absolute x so the grid stays stable while the box grows, then shifted local.
  const edgeInput = {
    startX: box.x,
    endX: box.x + box.width,
    segmentLength: edge.frequency,
    amplitude: edge.waviness * (1 + paper.absorbency * 0.5),
    roughness: edge.roughness,
  };
  const topEdge = buildEdge({ ...edgeInput, baseY: 0, seed: seed + SEED_TOP_EDGE });
  const bottomEdge = buildEdge({ ...edgeInput, baseY: box.height, seed: seed + SEED_BOTTOM_EDGE });
  for (const v of topEdge) v.x -= box.x;
  for (const v of bottomEdge) v.x -= box.x;

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
  const sens = speed.sensitivity;
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
    pool,
  };
}
