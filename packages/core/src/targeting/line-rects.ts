/**
 * Range → per-visual-line rectangles (A2, R20, R21). This is the read-only
 * layout stage: it runs `Range.getClientRects()` over the targeted ranges,
 * coalesces the raw fragments into one rect per visual line, and stamps each
 * line with the layout-stable seed the geometry layer derives all of its
 * deterministic jitter from (`seed = round((top - anchor.top) * 7)`, A5/A14 §5).
 *
 * All layout access here is reads only — no DOM writes (R21) — so the result can
 * be batched cleanly against a later write phase.
 *
 * The merge logic handles the realities of `getClientRects()`:
 * it returns one rect per text fragment, plus occasional
 * oversized "bbox artifacts" when a range crosses block boundaries. We drop the
 * artifacts (much taller than the median line), merge fragments that share a
 * vertical centre (hyphenation, inline `<em>`/`<a>` runs), and refuse to merge
 * across large horizontal gaps (so flex `justify-between` rows don't fuse into a
 * single ghost band).
 */

import type { Anchor, LineRect } from "../types.js";

/** Drop rects taller than this multiple of the median line height (bbox artifacts). */
const BBOX_REJECT_RATIO = 3.0;
/** Two rects share a line when their vertical centres differ by < this × median height. */
const MERGE_TOLERANCE = 0.5;
/** Don't merge same-line rects separated by a horizontal gap > this × median height. */
const MERGE_MAX_GAP_RATIO = 1.5;
/** Horizontal slop (px) around the anchor column when filtering stray rects. */
const COLUMN_SLOP = 24;
/** Seed quantization: anchor-relative top × this, rounded (≈0.14 px buckets). */
const SEED_SCALE = 7;

function hasDom(): boolean {
  return typeof document !== "undefined" && typeof Range !== "undefined";
}

/** A mutable line accumulator in absolute viewport px. */
interface LineBox {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/** Build a `DOMRect`-shaped object from edges, without relying on the constructor. */
function toDomRect(box: LineBox): DOMRect {
  const { top, bottom, left, right } = box;
  const width = right - left;
  const height = bottom - top;
  const rect = {
    x: left,
    y: top,
    width,
    height,
    top,
    right,
    bottom,
    left,
    toJSON() {
      return { x: left, y: top, width, height, top, right, bottom, left };
    },
  };
  return rect as DOMRect;
}

/** Median of a numeric array (lower-middle element of the sorted copy). */
function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

/**
 * Coalesce raw `getClientRects()` output into one rect per visual line.
 *
 * Drops bbox artifacts (rects taller than {@link BBOX_REJECT_RATIO} × the median
 * line height) and merges rects that share a vertical centre and sit within
 * {@link MERGE_MAX_GAP_RATIO} of each other horizontally. Pure: the input rects
 * are never mutated. The anchor-column filter (which needs the anchor) lives in
 * {@link rangesToLineRects}, so this function is a pure rect→rect transform.
 */
export function mergeRectsByLine(rects: DOMRect[]): DOMRect[] {
  if (rects.length === 0) return [];

  const heights = rects.map((r) => r.height);
  const med = median(heights);
  const tol = med * MERGE_TOLERANCE;
  const maxH = med * BBOX_REJECT_RATIO;
  const maxGap = med * MERGE_MAX_GAP_RATIO;

  const lines: LineBox[] = [];
  for (const r of rects) {
    // Reject paragraph-spanning bbox artifacts (only when we have a median to
    // compare against; a single-rect input has med === its own height).
    if (med > 0 && r.height > maxH) continue;

    const cy = (r.top + r.bottom) / 2;
    let merged = false;
    for (const line of lines) {
      if (Math.abs(cy - (line.top + line.bottom) / 2) >= tol) continue;
      // Only merge when horizontally adjacent — wide gaps mean separate columns.
      const gap = Math.max(r.left - line.right, line.left - r.right);
      if (gap > maxGap) continue;
      if (r.top < line.top) line.top = r.top;
      if (r.bottom > line.bottom) line.bottom = r.bottom;
      if (r.left < line.left) line.left = r.left;
      if (r.right > line.right) line.right = r.right;
      merged = true;
      break;
    }
    if (!merged) {
      lines.push({ top: r.top, bottom: r.bottom, left: r.left, right: r.right });
    }
  }

  // Top-to-bottom document order so isFirst/isLast and stagger read correctly.
  lines.sort((a, b) => a.top - b.top || a.left - b.left);
  return lines.map(toDomRect);
}

/**
 * Derive the layout-stable {@link Anchor} all per-line seeds are measured
 * against (A5). The anchor is the top-left-most point of the targeted content's
 * bounding box: the minimum `top` and minimum `left` across every client rect of
 * every range. Measuring seeds relative to this point makes them invariant under
 * scroll (anchor and lines shift together) and under forward/backward drag
 * extension (the top of an existing line doesn't move as the range grows).
 *
 * Returns `{ top: 0, left: 0 }` when there is nothing to measure.
 */
export function computeAnchor(ranges: Range[]): Anchor {
  let top = Infinity;
  let left = Infinity;

  if (hasDom()) {
    for (const range of ranges) {
      const rects = range.getClientRects();
      for (let i = 0; i < rects.length; i++) {
        const r = rects[i];
        if (r.width < 1 && r.height < 1) continue;
        if (r.top < top) top = r.top;
        if (r.left < left) left = r.left;
      }
    }
  }

  if (!Number.isFinite(top)) top = 0;
  if (!Number.isFinite(left)) left = 0;
  return { top, left };
}

/**
 * Run `getClientRects()` over `ranges`, merge into visual lines, filter stray
 * rects outside the anchor column, and emit one {@link LineRect} per line with
 * its stable seed and `isFirst`/`isLast` flags.
 *
 * The seed is `round((top - anchor.top) * SEED_SCALE)` — anchor-relative top
 * only, so it survives scroll and drag extension (A14 §5). `isFirst`/`isLast`
 * mark the document-order endpoints, which drive the wrap overshoot that stitches
 * adjacent lines into one continuous pen swipe (R20). Read-only (R21); returns
 * `[]` outside a DOM.
 */
export function rangesToLineRects(ranges: Range[], anchor: Anchor): LineRect[] {
  if (!hasDom() || ranges.length === 0) return [];

  // Collect every paintable client rect across all ranges.
  const raw: DOMRect[] = [];
  for (const range of ranges) {
    const rects = range.getClientRects();
    for (let i = 0; i < rects.length; i++) {
      const r = rects[i];
      if (r.width < 1 || r.height < 1) continue;
      raw.push(r);
    }
  }
  if (raw.length === 0) return [];

  // Anchor-column filter: drop rects horizontally outside the content column
  // (sr-only text, decorative wrappers, content in other columns). The column
  // is bounded by the anchor's left and the widest rect's right, with slop so
  // word-wrap on a trailing edge isn't clipped.
  const maxRight = Math.max(...raw.map((r) => r.right));
  const minLeft = anchor.left - COLUMN_SLOP;
  const maxRightBound = maxRight + COLUMN_SLOP;
  const columnRects = raw.filter(
    (r) => r.right >= minLeft && r.left <= maxRightBound,
  );

  const lines = mergeRectsByLine(columnRects.length > 0 ? columnRects : raw);
  if (lines.length === 0) return [];

  return lines.map((rect, index) => ({
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
    seed: Math.round((rect.top - anchor.top) * SEED_SCALE),
    isFirst: index === 0,
    isLast: index === lines.length - 1,
  }));
}
