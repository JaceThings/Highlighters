/**
 * Range → per-visual-line rectangles. The read-only layout stage: collect client
 * rects per text node, coalesce them into one rect per visual line, and stamp each
 * line with a layout-stable seed for the geometry layer's deterministic jitter.
 *
 * Per-text-node collection ({@link collectRangeRects}) avoids the full-width bbox
 * rects `getClientRects()` emits at block boundaries. The merge folds same-line
 * fragments (hyphenation, inline `<em>`/`<a>`) together, drops residual oversized
 * rects, and won't merge across large horizontal gaps (so flex `justify-between`
 * rows don't fuse into one ghost band).
 */

import type { Anchor, LineRect } from "../types.js";
import {
  FILTER_ACCEPT,
  FILTER_REJECT,
  SHOW_TEXT,
  hasDomWithRange,
  isInNonRenderedSubtree,
} from "../internal/dom.js";

function rectArray(list: DOMRectList): DOMRect[] {
  const out: DOMRect[] = [];
  for (let i = 0; i < list.length; i++) out.push(list[i]);
  return out;
}

/**
 * Client rects for a range, collected per text node.
 *
 * `Range.getClientRects()` across block boundaries emits full-width "bbox" rects
 * for the straddled blocks (and any empty block between) — spurious bands the
 * height-only filter in {@link mergeRectsByLine} doesn't catch. So for a
 * multi-text-node range we take the rects of a sub-range clamped to each text
 * node: tight to glyphs, no bbox possible. A single-text-node range has no
 * boundary to cross and keeps the range's own rects.
 */
function collectRangeRects(range: Range): DOMRect[] {
  const common = range.commonAncestorContainer;
  // A text-node common ancestor (or no TreeWalker) means a single text run.
  if (common.nodeType === 3 || typeof document.createTreeWalker !== "function") {
    return rectArray(range.getClientRects());
  }

  const walker = document.createTreeWalker(common, SHOW_TEXT, {
    acceptNode(node: Node) {
      if (isInNonRenderedSubtree(node)) return FILTER_REJECT;
      // intersectsNode is near-universal; fall back to "accept" if a host lacks it.
      const hit =
        typeof range.intersectsNode === "function"
          ? range.intersectsNode(node)
          : true;
      return hit ? FILTER_ACCEPT : FILTER_REJECT;
    },
  } as NodeFilter);

  const texts: Text[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) texts.push(n as Text);

  // 0 or 1 text node: the range's own rects are already artifact-free.
  if (texts.length <= 1) return rectArray(range.getClientRects());

  // 2+ text nodes: one sub-range per text node, clamped to the parent range's
  // endpoints, so every rect hugs real glyphs.
  const out: DOMRect[] = [];
  for (const text of texts) {
    const start = text === range.startContainer ? range.startOffset : 0;
    const end = text === range.endContainer ? range.endOffset : text.length;
    if (end <= start) continue;
    const sub = document.createRange();
    sub.setStart(text, start);
    sub.setEnd(text, end);
    for (const r of rectArray(sub.getClientRects())) out.push(r);
  }
  return out;
}

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

/** A mutable line accumulator in absolute viewport px. */
interface LineBox {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/** `DOMRect`-shaped object from edges, without relying on the constructor (jsdom). */
function toDomRect(box: LineBox): DOMRect {
  const { top, bottom, left, right } = box;
  const width = right - left;
  const height = bottom - top;
  return {
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
  } as DOMRect;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

/**
 * Coalesce raw `getClientRects()` output into one rect per visual line. Drops bbox
 * artifacts (taller than {@link BBOX_REJECT_RATIO} × median height) and merges
 * rects sharing a vertical centre within {@link MERGE_MAX_GAP_RATIO} horizontally.
 * Pure rect→rect transform; input is never mutated.
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
    // Reject paragraph-spanning bbox artifacts (only with a median to compare
    // against; a single-rect input has med === its own height).
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
 * The top-left-most point of the targeted content's bounding box (min `top`, min
 * `left` across every client rect). Used as the horizontal column-filter origin.
 * Returns `{ top: 0, left: 0 }` when there is nothing to measure.
 */
export function computeAnchor(ranges: Range[]): Anchor {
  let top = Infinity;
  let left = Infinity;

  if (hasDomWithRange()) {
    for (const range of ranges) {
      // Same per-text-node collection the line stage uses, so both stages agree
      // on the content edge.
      for (const r of collectRangeRects(range)) {
        // Must use the SAME `||` sub-pixel test `rangesToLineRects` uses, or the
        // anchor could latch onto a caret rect the line stage discards and shift
        // the column filter relative to the painted lines.
        if (r.width < 1 || r.height < 1) continue;
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
 * Collect per-text-node rects over `ranges`, merge into visual lines, filter
 * stray rects outside the anchor column, and emit one {@link LineRect} per line
 * with its stable seed and `isFirst`/`isLast` flags. `anchor` drives the
 * horizontal column filter. Read-only; returns `[]` outside a DOM.
 */
export function rangesToLineRects(
  ranges: Range[],
  anchor: Anchor,
  originTop = 0,
): LineRect[] {
  if (!hasDomWithRange() || ranges.length === 0) return [];

  const raw: DOMRect[] = [];
  for (const range of ranges) {
    for (const r of collectRangeRects(range)) {
      if (r.width < 1 || r.height < 1) continue;
      raw.push(r);
    }
  }
  if (raw.length === 0) return [];

  // Anchor-column filter: drop rects horizontally outside the content column
  // (sr-only text, decorative wrappers, other columns), bounded by the anchor's
  // left and the widest rect's right plus slop. Bounded loop, not
  // `Math.max(...spread)`, so a huge full-page scan can't blow the call stack.
  let maxRight = -Infinity;
  for (const r of raw) if (r.right > maxRight) maxRight = r.right;
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
    // Seed off `originTop` (overlay container's document origin), NOT the
    // selection's min-top: min-top moves when an upward drag adds a line above,
    // which would re-roll every seed and re-randomize already-painted shapes. The
    // container origin never moves with the selection (still scroll-stable — both
    // shift together).
    seed: Math.round((rect.top - originTop) * SEED_SCALE),
    isFirst: index === 0,
    isLast: index === lines.length - 1,
  }));
}
