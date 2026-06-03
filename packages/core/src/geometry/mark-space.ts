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
 * The resolution-independent tie-it-together step: from one line rect + resolved
 * options + seed, produce the complete absolute-px {@link MarkGeometry} for a
 * single visual line.
 *
 * Everything is anchored to absolute px and seeded by the line's stable seed, so
 * identical inputs yield a byte-identical result; the same mark at two widths
 * shares wave wavelength, grain density, and cap-pool px (only the period count
 * differs); and growing the mark only appends fresh grid vertices. Consumes a
 * plain {@link LineRect} (no DOM access), so it is safe from the SSR `/path` entry.
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

/** A non-negative modulo (JS `%` keeps the sign of the dividend). */
function mod(n: number, m: number): number {
  return ((n % m) + m) % m;
}

/**
 * Resolve the band's vertical placement and thickness for the mark type. Every
 * mark is one band primitive at a different position/height: highlight fills the
 * line; underline/overline are thin bands at the baseline/top; strike-through a
 * thin centered band. Returns the top offset (relative to the padded top) and
 * height, both px.
 */
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
 * @param seed - The stable seed every value derives from (the line's
 *   anchor-relative seed, or an explicit `options.seed`).
 * @param flowReversed - Pour the dry-out gradient from the right (the nib's
 *   touchdown end on a backward live selection). Only the live-selection path sets it.
 * @param speedProfile - Live-only per-line swipe-speed read. When present, the line
 *   gets speed-aware deposit (per-x, in the pool gradient) and texture (per-line).
 *   Absent for every static mark and no-drag paint, leaving byte-identical geometry.
 */
export function buildMarkGeometry(
  lineRect: LineRect,
  options: ResolvedOptions,
  seed: number,
  flowReversed = false,
  speedProfile?: LineSpeedProfile,
): MarkGeometry {
  const { edge, ink, tip, paper, speed } = options;

  // `tip.overshoot` is how far EACH end of EVERY line runs past (positive) or
  // short of (negative) the text edge. The per-end jitter keeps the two ends off
  // an identical inset, seeded by the width-independent line seed so growing a
  // mark never shifts its start.
  const endOver = (s: number): number =>
    tip.overshoot + hashJitter(s) * tip.overshootJitter;
  const leftExt = endOver(seed + SEED_LEFT_OVER);
  const rightExt = endOver(seed + SEED_RIGHT_OVER);

  // Per-line slant jitter, seeded by the line seed (stable under
  // scroll/resize/draw-on). Drives BOTH the clip-path and the `slant`/`minFront`
  // fields, so the painted shape and the draw-on front agree.
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

  // Amplitude grows slightly with paper absorbency (a wetter, fuzzier edge);
  // wavelength is the resolved px frequency, width-independent.
  const amplitude = edge.waviness * (1 + paper.absorbency * 0.5);
  const segmentLength = edge.frequency;

  // The grid uses absolute x so growing the extent appends fresh grid vertices;
  // the emitted vertices are then shifted into local box coordinates for the path.
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

  // Grid index is preserved so prefix-stability tests can compare per-index vertices.
  const toLocal = (v: EdgeVertex): EdgeVertex => ({
    x: v.x - box.x,
    y: v.y,
    gridIndex: v.gridIndex,
  });
  const topEdge: EdgeVertex[] = topAbs.map(toLocal);
  const bottomEdge: EdgeVertex[] = bottomAbs.map(toLocal);

  // Clip-path parameterized by an advancing front for the draw-on. The full mark
  // is `clipAtFront(box.width)`; the entrance calls it with a growing front so the
  // band gains grid nodes frame to frame (never stretches).
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

  // Shared noise tile (never scaled): streakiness → lengthwise lanes, feathering
  // (+ absorbency) → soft blotches, dryout → transparent skip-holes (viscosity
  // raises dryout). Speed-aware texture (live drag only): a faster mean swipe lays
  // a drier, streakier line. This is per-line - the tile is one sample window per
  // line - so it tracks mean speed; the per-x dry-out lives in the pool gradient.
  // With no profile, the three values reduce to the original expressions.
  const sp = speedProfile;
  const m = sp ? sp.meanNorm : 0;
  const sens = speed.sensitivity;
  const baseDryout = ink.dryout + ink.viscosity * 0.2;
  const baseStreak = ink.streakiness;
  const baseFeather = ink.feathering + paper.absorbency * 0.25;
  const noiseTile: NoiseTile = buildNoiseTile({
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
    x: -mod(seed * MASK_X_MULT, noiseTile.width),
    y: -mod(seed * MASK_Y_MULT, noiseTile.height),
  };

  const pool = buildPoolGradient({
    lengthPx: box.width,
    startEndBuildup: ink.startEndBuildup,
    color: options.color,
    opacity: options.opacity,
    angle: options.gradient?.angle ?? undefined,
    flowFade: ink.flowFade,
    flowReversed,
    // Live speed path: per-x deposit across N stops + extra end pooling from
    // deceleration. Omitted without a profile (legacy 4-stop).
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
