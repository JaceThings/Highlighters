import type {
  Box,
  EdgeVertex,
  LineRect,
  MarkGeometry,
  MaskOffset,
  NoiseTile,
  ResolvedOptions,
} from "../types.js";
import { buildClipPath } from "./clip-path.js";
import { buildEdge } from "./edges.js";
import { buildNoiseTile } from "./noise-tile.js";
import { buildPoolGradient } from "./pool.js";
import { jitterUnit } from "./rng.js";

/**
 * The resolution-independent tie-it-together step (anchored-grid doc, blueprint
 * R22c/R22d/A14): from one line rect + resolved options + seed, produce the
 * complete absolute-px {@link MarkGeometry} for a single visual line.
 *
 * Everything here is anchored to absolute pixel coordinates and seeded by the
 * line's stable seed, so:
 *
 *  - identical inputs yield a **byte-identical** result (V2 determinism);
 *  - the same logical mark at two widths shares wave wavelength, grain density,
 *    and cap-pool px — only the *count* of wave periods differs (V9e);
 *  - growing the mark only appends fresh grid vertices; the path prefix for the
 *    already-covered region stays unchanged (V9f).
 *
 * The function consumes a plain {@link LineRect} (no DOM access), so it is safe
 * from the SSR `/path` entry.
 */

/** Per-line coverage extension bounds, in px (a tight hug around the text). */
const LEFT_MIN = 5;
const LEFT_MAX = 8;
const RIGHT_MIN = 5;
const RIGHT_MAX = 9;
/** Vertical padding above/below the text so the wavy edge stays clear of glyphs. */
const VERT_PAD = 2;

/**
 * Wrap overshoot in px applied to the *inner* edge of a multiline run so a
 * line's end and the next line's start visually connect into one pen swipe (R20):
 * a non-terminal line overshoots on the right, a non-initial line on the left.
 */
const WRAP_OVERSHOOT = 12;

/** Decorrelating seed offsets, one per derived role. */
const SEED_LEFT_EXT = 0;
const SEED_RIGHT_EXT = 11;
const SEED_TOP_EDGE = 200;
const SEED_BOTTOM_EDGE = 300;

/** Mask-sample offset multipliers (A14 §1 / source). */
const MASK_X_MULT = 37;
const MASK_Y_MULT = 13;

/** A non-negative modulo (JS `%` keeps the sign of the dividend). */
function mod(n: number, m: number): number {
  return ((n % m) + m) % m;
}

/**
 * Resolve the band's vertical placement and thickness for the mark type.
 *
 * All three marks are the same band primitive at different vertical positions
 * (A8): a `highlight` covers the whole line height, an `underline` is a thin band
 * at the baseline, a `strike-through` is a thin band centered on the x-height.
 * Returns the band's top offset (relative to the line's padded top) and height,
 * both in px.
 */
function resolveBand(
  markType: ResolvedOptions["markType"],
  lineHeight: number,
): { offsetY: number; height: number } {
  if (markType === "underline") {
    const thickness = Math.max(2, lineHeight * 0.12);
    // Sit just under the text: near the bottom of the line box.
    return { offsetY: lineHeight - thickness, height: thickness };
  }
  if (markType === "strike-through") {
    const thickness = Math.max(2, lineHeight * 0.12);
    // Centered vertically on the line.
    return { offsetY: (lineHeight - thickness) / 2, height: thickness };
  }
  // highlight — the full-line band.
  return { offsetY: 0, height: lineHeight };
}

/**
 * Build the full geometry for one visual line.
 *
 * @param lineRect - The line's measured rect, in absolute px, with its
 *   first/last flags (controls wrap overshoot).
 * @param options - Fully-resolved options (the single source of truth).
 * @param seed - The stable seed every value derives from. The caller passes the
 *   line's anchor-relative seed (or an explicit `options.seed`).
 */
export function buildMarkGeometry(
  lineRect: LineRect,
  options: ResolvedOptions,
  seed: number,
): MarkGeometry {
  const { edge, ink, tip, paper } = options;

  // --- Coverage extensions (deterministic per seed) -------------------------
  // Tight outward hug so the band reads as a marker pass, not an oversized blob.
  const leftExt = LEFT_MIN + jitterUnit(seed + SEED_LEFT_EXT) * (LEFT_MAX - LEFT_MIN);
  const rightExt = RIGHT_MIN + jitterUnit(seed + SEED_RIGHT_EXT) * (RIGHT_MAX - RIGHT_MIN);

  // Wrap overshoot connects line ends into one continuous swipe (R20): extend
  // the trailing edge of every non-terminal line and the leading edge of every
  // non-initial line past the text box.
  const leftWrap = lineRect.isFirst ? 0 : WRAP_OVERSHOOT;
  const rightWrap = lineRect.isLast ? 0 : WRAP_OVERSHOOT;

  // --- Band box in absolute px ----------------------------------------------
  const band = resolveBand(options.markType, lineRect.height);
  const boxX = lineRect.left - leftExt - leftWrap;
  const boxY = lineRect.top - VERT_PAD + band.offsetY;
  const boxWidth = lineRect.width + leftExt + rightExt + leftWrap + rightWrap;
  const boxHeight = band.height + VERT_PAD * 2;
  const box: Box = { x: boxX, y: boxY, width: boxWidth, height: boxHeight };

  // --- Wave edges on the fixed global grid ----------------------------------
  // Amplitude grows slightly with paper absorbency (a wetter, fuzzier edge);
  // wavelength is the resolved px segmentLength (frequency), width-independent.
  const amplitude = edge.waviness * (1 + paper.absorbency * 0.5);
  const segmentLength = edge.frequency;

  // Edge baselines are local to the box: the top edge runs along y≈0 (after the
  // top corner inset), the bottom edge along y≈height. The grid uses absolute x
  // (box.x .. box.x + width) so growing the extent appends fresh grid vertices;
  // we then shift the emitted vertices into local box coordinates for the path.
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

  // Translate grid x into local box coordinates for the clip path. The grid
  // index is preserved so prefix-stability tests can compare per-index vertices.
  const toLocal = (v: EdgeVertex): EdgeVertex => ({
    x: v.x - box.x,
    y: v.y,
    gridIndex: v.gridIndex,
  });
  const topEdge: EdgeVertex[] = topAbs.map(toLocal);
  const bottomEdge: EdgeVertex[] = bottomAbs.map(toLocal);

  // --- Clip path (absolute-px local path()) ---------------------------------
  const clipPath = buildClipPath({
    box,
    tip,
    topEdge,
    bottomEdge,
    cap: edge.cap,
    radius: edge.radius,
  });

  // --- Shared noise tile + per-line sample offset (never scaled) ------------
  const noiseTile: NoiseTile = buildNoiseTile({
    seed,
    streakiness: ink.streakiness,
    feathering: ink.feathering + paper.absorbency * 0.25,
  });
  const maskOffset: MaskOffset = {
    x: -mod(seed * MASK_X_MULT, noiseTile.width),
    y: -mod(seed * MASK_Y_MULT, noiseTile.height),
  };

  // --- End-pool gradient (absolute-px clamped) ------------------------------
  const pool = buildPoolGradient({
    lengthPx: box.width,
    startEndBuildup: ink.startEndBuildup,
    color: options.color,
    opacity: options.opacity,
    angle: options.gradient?.angle ?? undefined,
  });

  return {
    box,
    seed,
    clipPath,
    topEdge,
    bottomEdge,
    noiseTile,
    maskOffset,
    pool,
  };
}
