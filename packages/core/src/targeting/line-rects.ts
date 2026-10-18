import type { Anchor, LineRect } from "../types.js";
import {
  FILTER_ACCEPT,
  FILTER_REJECT,
  SHOW_TEXT,
  hasDomWithRange,
  isInNonRenderedSubtree,
  nextTextNode,
} from "../internal/dom.js";

function isHiddenText(node: Node): boolean {
  const parent = node.parentElement;
  return !!parent && getComputedStyle(parent).visibility === "hidden";
}

function collectRangeRects(range: Range, scope?: Element): DOMRect[] {
  const common = scope ?? range.commonAncestorContainer;
  if (!scope && common.nodeType === 3) return Array.from(range.getClientRects());

  const walker = document.createTreeWalker(common, SHOW_TEXT, {
    acceptNode: (node) =>
      !isInNonRenderedSubtree(node) && !isHiddenText(node) && range.intersectsNode(node)
        ? FILTER_ACCEPT
        : FILTER_REJECT,
  });

  const texts: Text[] = [];
  for (let n = nextTextNode(walker); n; n = nextTextNode(walker)) texts.push(n);
  if (texts.length <= 1) return Array.from(range.getClientRects());

  const out: DOMRect[] = [];
  for (const text of texts) {
    const start = text === range.startContainer ? range.startOffset : 0;
    const end = text === range.endContainer ? range.endOffset : text.length;
    if (end <= start) continue;
    const sub = document.createRange();
    sub.setStart(text, start);
    sub.setEnd(text, end);
    out.push(...sub.getClientRects());
  }
  return out;
}

const BBOX_REJECT_RATIO = 3.0;
const MERGE_TOLERANCE = 0.5;
const MERGE_MAX_GAP_RATIO = 1.5;
const COLUMN_SLOP = 24;
const SEED_SCALE = 7;

interface LineBox {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

function mergeRectsToBoxes(rects: DOMRect[]): LineBox[] {
  if (rects.length === 0) return [];

  const med = median(rects.map((r) => r.height));
  const tol = med * MERGE_TOLERANCE;
  const maxH = med * BBOX_REJECT_RATIO;
  const maxGap = med * MERGE_MAX_GAP_RATIO;

  const lines: LineBox[] = [];
  for (const r of rects) {
    if (med > 0 && r.height > maxH) continue;

    const cy = (r.top + r.bottom) / 2;
    let merged = false;
    for (const line of lines) {
      if (Math.abs(cy - (line.top + line.bottom) / 2) >= tol) continue;
      if (Math.max(r.left - line.right, line.left - r.right) > maxGap) continue;
      line.top = Math.min(line.top, r.top);
      line.bottom = Math.max(line.bottom, r.bottom);
      line.left = Math.min(line.left, r.left);
      line.right = Math.max(line.right, r.right);
      merged = true;
      break;
    }
    if (!merged) lines.push({ top: r.top, bottom: r.bottom, left: r.left, right: r.right });
  }

  return lines.sort((a, b) => a.top - b.top || a.left - b.left);
}

export function mergeRectsByLine(rects: DOMRect[]): DOMRect[] {
  return mergeRectsToBoxes(rects).map(
    (b) => new DOMRect(b.left, b.top, b.right - b.left, b.bottom - b.top),
  );
}

export function computeAnchor(ranges: Range[]): Anchor {
  let top = Infinity;
  let left = Infinity;

  if (hasDomWithRange()) {
    for (const range of ranges) {
      for (const r of collectRangeRects(range)) {
        if (r.width < 1 || r.height < 1) continue;
        top = Math.min(top, r.top);
        left = Math.min(left, r.left);
      }
    }
  }

  return { top: Number.isFinite(top) ? top : 0, left: Number.isFinite(left) ? left : 0 };
}

export interface RangesToLineRectsOptions {
  scope?: Element;
  columnBounds?: { left: number; right: number };
}

export function rangesToLineRects(
  ranges: Range[],
  anchor?: Anchor,
  originTop = 0,
  options?: RangesToLineRectsOptions,
): LineRect[] {
  if (!hasDomWithRange() || ranges.length === 0) return [];

  const raw: DOMRect[] = [];
  for (const range of ranges) {
    for (const r of collectRangeRects(range, options?.scope)) {
      if (r.width >= 1 && r.height >= 1) raw.push(r);
    }
  }
  if (raw.length === 0) return [];

  const bounds = options?.columnBounds;
  let column = raw;
  if (bounds || anchor) {
    let maxRight = -Infinity;
    for (const r of raw) maxRight = Math.max(maxRight, r.right);
    const minLeft = (bounds?.left ?? anchor!.left) - COLUMN_SLOP;
    const maxRightBound = (bounds?.right ?? maxRight) + COLUMN_SLOP;
    const filtered = raw.filter((r) => r.right >= minLeft && r.left <= maxRightBound);
    if (filtered.length > 0) column = filtered;
  }

  const lines = mergeRectsToBoxes(column);
  const last = lines.length - 1;
  const used = new Set<number>();
  return lines.map((box, index) => {
    // origin, not min-top: upward drags must not re-roll seeds; side-by-side lines (columns, table cells) share a top so bump until unique
    let seed = Math.round((box.top - originTop) * SEED_SCALE);
    while (used.has(seed)) seed++;
    used.add(seed);
    return {
      left: box.left,
      top: box.top,
      width: box.right - box.left,
      height: box.bottom - box.top,
      seed,
      isFirst: index === 0,
      isLast: index === last,
    };
  });
}
