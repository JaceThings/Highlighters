import type {
  Box,
  EdgeVertex,
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
import { buildPoolGradient } from "./pool.js";
import { hashJitter } from "./rng.js";

/**
 * From one line rect + resolved options + seed, produce the complete absolute-px
 * {@link MarkGeometry} for a single visual line. Everything is anchored to absolute px
 * and seeded by the stable line seed, so identical inputs yield byte-identical output
 * and growing the mark only appends grid vertices. No DOM access (SSR-safe).
 */

/** Vertical padding above/below the text so the wavy edge stays clear of glyphs. */
const VERT_PAD = 2;

/** Decorrelating seed offsets, one per derived role. */
const SEED_LEFT_OVER = 0;
const SEED_RIGHT_OVER = 11;
const SEED_TOP_EDGE = 200;
const SEED_BOTTOM_EDGE = 300;
const SEED_ANGLE = 400;

const MASK_X_MULT = 37;
const MASK_Y_MULT = 13;
// Fixed width-invariant noise tile, wide enough that the mask-repeat seam clears any normal band.
// WebKit draws a hairline at mask tile edges; a smaller tile lands that seam inside the band.
const NOISE_TILE_W = 1024;
const NOISE_TILE_H = 64;
const MASK_OFFSET_X = 96;
const MASK_OFFSET_Y = 16;

/** A non-negative modulo (JS `%` keeps the sign of the dividend). */
function mod(n: number, m: number): number {
  return ((n % m) + m) % m;
}

/** Resolve the band's vertical offset and height (px) for the mark type. Every mark is one band primitive at a different position/height. */
function resolveBand(
  markType: ResolvedOptions["markType"],
  lineHeight: number,
): { offsetY: number; height: number } {
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

/**
 * Build the full geometry for one visual line.
 *
 * @param seed - The stable seed every value derives from.
 * @param flowReversed - Pour the dry-out gradient from the right (backward live selection).
 * @param speedProfile - Live-only per-line swipe-speed read; absent leaves byte-identical geometry.
 */
export function buildMarkGeometry(
  lineRect: LineRect,
  options: ResolvedOptions,
  seed: number,
  flowReversed = false,
  speedProfile?: LineSpeedProfile,
): MarkGeometry {
  const { edge, ink, tip, paper, speed } = options;

  // How far each end runs past (or short of) the text edge, jittered per end and seeded by the width-independent line seed so growing a mark never shifts its start.
  const endOver = (s: number): number =>
    tip.overshoot + hashJitter(s) * tip.overshootJitter;
  const leftExt = endOver(seed + SEED_LEFT_OVER);
  const rightExt = endOver(seed + SEED_RIGHT_OVER);

  // Per-line slant jitter drives both the clip-path and the slant/minFront fields, so painted shape and draw-on front agree.
  const slantTip =
    tip.angleJitter > 0
      ? { ...tip, angle: tip.angle + hashJitter(seed + SEED_ANGLE) * tip.angleJitter }
      : tip;

  const band = resolveBand(options.markType, lineRect.height);
  const boxX = lineRect.left - leftExt;
  const boxY = lineRect.top - VERT_PAD + band.offsetY;
  // Positive-width clamp so an aggressive negative overshoot can't invert the box.
  const boxWidth = Math.max(1, lineRect.width + leftExt + rightExt);
  const boxHeight = band.height + VERT_PAD * 2;
  const box: Box = { x: boxX, y: boxY, width: boxWidth, height: boxHeight };

  // Amplitude grows with paper absorbency (wetter, fuzzier edge); wavelength is the width-independent px frequency.
  const amplitude = edge.waviness * (1 + paper.absorbency * 0.5);
  const segmentLength = edge.frequency;

  // Absolute-x grid so growing the extent appends fresh vertices; shifted to local box coords below.
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

  // Grid index preserved so prefix-stability tests can compare per-index vertices.
  const toLocal = (v: EdgeVertex): EdgeVertex => ({
    x: v.x - box.x,
    y: v.y,
    gridIndex: v.gridIndex,
  });
  const topEdge: EdgeVertex[] = topAbs.map(toLocal);
  const bottomEdge: EdgeVertex[] = bottomAbs.map(toLocal);

  // Clip-path parameterized by an advancing front; the entrance grows the front so the band gains grid nodes rather than stretching.
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

  // Per-line noise tile (never scaled). With a live profile a faster mean swipe lays a drier, streakier line; without one the three values reduce to the base expressions.
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
  // Offsets capped to the headroom so the wrap stays past the band's right/bottom edge.
  const maskOffset: MaskOffset = {
    x: -mod(seed * MASK_X_MULT, MASK_OFFSET_X),
    y: -mod(seed * MASK_Y_MULT, MASK_OFFSET_Y),
  };

  const pool = buildPoolGradient({
    lengthPx: box.width,
    startEndBuildup: ink.startEndBuildup,
    color: options.color,
    opacity: options.opacity,
    angle: options.gradient?.angle ?? undefined,
    flowFade: ink.flowFade,
    flowReversed,
    // Live speed path: per-x deposit across N stops + extra end pooling from deceleration. Omitted without a profile.
    ...(sp
      ? {
          coreStopCount: speed.resolution,
          depositAt: sp.depositAt,
          decelBuildup: speed.poolBoost * sens * sp.decel,
        }
      : {}),
  });

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
