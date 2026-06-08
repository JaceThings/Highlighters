/**
 * Range to per-visual-line rectangles: the read-only layout stage. Collect client rects per text node,
 * coalesce into one rect per visual line, and stamp each line with a layout-stable seed for the
 * geometry layer's jitter. Per-text-node collection avoids the full-width bbox rects `getClientRects()`
 * emits at block boundaries; the merge folds same-line fragments but won't merge across large
 * horizontal gaps (so `justify-between` rows don't fuse into one ghost band).
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

/** Reject text whose parent is `visibility: hidden` (layout spacers still emit client rects). */
function isHiddenText(node: Node): boolean {
  if (typeof getComputedStyle === "undefined") return false;
  const parent = node.parentElement;
  if (!parent) return false;
  try {
    return getComputedStyle(parent).visibility === "hidden";
  } catch {
    return false;
  }
}

/**
 * Client rects for a range, collected per text node. `Range.getClientRects()` across block boundaries
 * emits spurious full-width bbox rects, so a multi-text-node range uses a sub-range clamped to each
 * text node (tight to glyphs); a single-text-node range keeps its own rects.
 *
 * When `scope` is set, only text nodes under that element are walked — the reading-surface boundary
 * for live selection, so page chrome outside `article`/`main` is never measured.
 */
function collectRangeRects(range: Range, scope?: Element): DOMRect[] {
  const common = scope ?? range.commonAncestorContainer;
  // A text-node common ancestor (or no TreeWalker) is a single text run.
  if (!scope && common.nodeType === 3) {
    return rectArray(range.getClientRects());
  }
  if (typeof document.createTreeWalker !== "function") {
    return rectArray(range.getClientRects());
  }

  const walker = document.createTreeWalker(common, SHOW_TEXT, {
    acceptNode(node: Node) {
      if (isInNonRenderedSubtree(node)) return FILTER_REJECT;
      if (isHiddenText(node)) return FILTER_REJECT;
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

  // 2+ text nodes: one sub-range per text node, clamped to the parent range's endpoints.
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

/** Coalesce raw `getClientRects()` output into one rect per visual line, dropping bbox artifacts and merging rects sharing a vertical centre. Pure; input never mutated. */
export function mergeRectsByLine(rects: DOMRect[]): DOMRect[] {
  if (rects.length === 0) return [];

  const heights = rects.map((r) => r.height);
  const med = median(heights);
  const tol = med * MERGE_TOLERANCE;
  const maxH = med * BBOX_REJECT_RATIO;
  const maxGap = med * MERGE_MAX_GAP_RATIO;

  const lines: LineBox[] = [];
  for (const r of rects) {
    // Reject paragraph-spanning bbox artifacts (only when there's a median to compare against).
    if (med > 0 && r.height > maxH) continue;

    const cy = (r.top + r.bottom) / 2;
    let merged = false;
    for (const line of lines) {
      if (Math.abs(cy - (line.top + line.bottom) / 2) >= tol) continue;
      // Only merge when horizontally adjacent; wide gaps mean separate columns.
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

  // Top-to-bottom order so isFirst/isLast and stagger read correctly.
  lines.sort((a, b) => a.top - b.top || a.left - b.left);
  return lines.map(toDomRect);
}

/** The top-left-most point of the targeted content's bounding box; the horizontal column-filter origin. `{0, 0}` with nothing to measure. */
export function computeAnchor(ranges: Range[]): Anchor {
  let top = Infinity;
  let left = Infinity;

  if (hasDomWithRange()) {
    for (const range of ranges) {
      // Same per-text-node collection the line stage uses, so both stages agree on the content edge.
      for (const r of collectRangeRects(range)) {
        // Must use the same sub-pixel test `rangesToLineRects` uses, else the anchor latches onto a
        // caret rect the line stage discards and shifts the column filter off the painted lines.
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

export interface RangesToLineRectsOptions {
  /** Only measure text under this element (live-selection reading surface). */
  scope?: Element;
  /** Anchor element bounds for column filtering; when set, both edges come from the host rect. */
  columnBounds?: { left: number; right: number };
}

/** Collect per-text-node rects, merge into visual lines, drop rects outside the anchor column, and emit one {@link LineRect} per line with its stable seed. Read-only. */
export function rangesToLineRects(
  ranges: Range[],
  anchor: Anchor,
  originTop = 0,
  options?: RangesToLineRectsOptions,
): LineRect[] {
  if (!hasDomWithRange() || ranges.length === 0) return [];

  const raw: DOMRect[] = [];
  for (const range of ranges) {
    for (const r of collectRangeRects(range, options?.scope)) {
      if (r.width < 1 || r.height < 1) continue;
      raw.push(r);
    }
  }
  if (raw.length === 0) return [];

  // Anchor-column filter: drop rects horizontally outside the content column. Live selection passes
  // the overlay host's viewport bounds; static marks use selection min-left and widest rect right.
  let maxRight = -Infinity;
  for (const r of raw) if (r.right > maxRight) maxRight = r.right;
  const bounds = options?.columnBounds;
  const minLeft = (bounds?.left ?? anchor.left) - COLUMN_SLOP;
  const maxRightBound = (bounds?.right ?? maxRight) + COLUMN_SLOP;
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
    // Seed off `originTop` (container's document origin), not the selection's min-top: min-top moves
    // when an upward drag adds a line above, re-rolling every seed and re-randomizing painted shapes.
    seed: Math.round((rect.top - originTop) * SEED_SCALE),
    isFirst: index === 0,
    isLast: index === lines.length - 1,
  }));
}
